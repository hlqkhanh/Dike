import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { assertLocalEnvironment, pkceChallenge } from './security.js';

const environment = process.env.APP_ENV ?? 'local';
assertLocalEnvironment(environment);

const issuer = (process.env.MOCK_OIDC_ISSUER ?? 'http://127.0.0.1:3002').replace(/\/$/, '');
const issuerUrl = new URL(issuer);
if (!['127.0.0.1', 'localhost'].includes(issuerUrl.hostname)) {
  throw new Error('Mock OIDC provider must bind to localhost');
}
const port = Number(issuerUrl.port || '3002');
const clientId = process.env.GOOGLE_CLIENT_ID ?? 'dike-local-client';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? 'dike-local-client-secret';
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback';

interface Account {
  sub: string;
  email: string;
  name: string;
}

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  account: Account;
  expiresAt: number;
}

const accounts: Record<string, Account> = {
  alice: { sub: 'mock-google-alice', email: 'alice@dike.invalid', name: 'Alice Dike' },
  bob: { sub: 'mock-google-bob', email: 'bob@dike.invalid', name: 'Bob Dike' },
  'alice-conflict': {
    sub: 'mock-google-alice-conflict',
    email: 'alice@dike.invalid',
    name: 'Alice Conflict',
  },
};
const codes = new Map<string, AuthorizationCode>();
const { privateKey, publicKey } = await generateKeyPair('RS256');
const keyId = randomBytes(12).toString('base64url');
const publicJwk = { ...(await exportJWK(publicKey)), kid: keyId, use: 'sig', alg: 'RS256' };

function securityHeaders(response: ServerResponse, contentType: string): void {
  response.setHeader('content-type', contentType);
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader(
    'content-security-policy',
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
  );
}

function json(response: ServerResponse, status: number, body: unknown): void {
  securityHeaders(response, 'application/json; charset=utf-8');
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 32_768) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function validateAuthorization(parameters: URLSearchParams): string | null {
  if (parameters.get('client_id') !== clientId) return 'invalid client';
  if (parameters.get('redirect_uri') !== redirectUri) return 'invalid redirect URI';
  if (parameters.get('response_type') !== 'code') return 'unsupported response type';
  if (parameters.get('code_challenge_method') !== 'S256') return 'PKCE S256 is required';
  if (!parameters.get('code_challenge') || !parameters.get('state') || !parameters.get('nonce')) {
    return 'missing security parameters';
  }
  const scopes = new Set((parameters.get('scope') ?? '').split(' '));
  if (!scopes.has('openid') || !scopes.has('email') || !scopes.has('profile')) {
    return 'missing required scopes';
  }
  return null;
}

function authorizationPage(parameters: URLSearchParams): string {
  const hidden = [...parameters.entries()]
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join('');
  const options = Object.entries(accounts)
    .map(
      ([id, account], index) =>
        `<label><input type="radio" name="account" value="${escapeHtml(id)}" ${index === 0 ? 'checked' : ''}> <strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.email)}</small></label>`,
    )
    .join('');
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Dike Mock Identity Provider</title><style>body{font-family:system-ui;background:#f7faf9;color:#10231d;margin:0;padding:40px}main{background:white;border:1px solid #d7e3de;border-radius:16px;max-width:520px;margin:auto;padding:28px}h1{font-size:1.5rem}p{color:#52665e}label{border:1px solid #d7e3de;border-radius:10px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:12px 0;padding:14px}label input{grid-row:1/3}small{color:#52665e}.actions{display:flex;gap:12px;margin-top:24px}button{background:#0f766e;border:0;border-radius:8px;color:white;font:inherit;font-weight:700;padding:12px 16px}button[value=deny]{background:#52665e}</style><main><p>LOCAL/TEST ONLY</p><h1>Chọn tài khoản thử nghiệm</h1><p>Trang này mô phỏng redirect OIDC thật và không tồn tại trong production.</p><form method="post" action="/authorize">${hidden}${options}<div class="actions"><button name="decision" value="allow">Tiếp tục</button><button name="decision" value="deny">Từ chối</button></div></form></main></html>`;
}

function authorizeGet(url: URL, response: ServerResponse): void {
  const validation = validateAuthorization(url.searchParams);
  if (validation) return json(response, 400, { error: 'invalid_request' });
  securityHeaders(response, 'text/html; charset=utf-8');
  response.writeHead(200);
  response.end(authorizationPage(url.searchParams));
}

async function authorizePost(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const form = await readForm(request);
  const validation = validateAuthorization(form);
  if (validation) return json(response, 400, { error: 'invalid_request' });
  const destination = new URL(redirectUri);
  destination.searchParams.set('state', form.get('state') ?? '');
  if (form.get('decision') === 'deny') {
    destination.searchParams.set('error', 'access_denied');
    response.writeHead(303, { location: destination.toString(), 'cache-control': 'no-store' });
    response.end();
    return;
  }
  const account = accounts[form.get('account') ?? ''];
  if (!account) return json(response, 400, { error: 'invalid_request' });
  const code = randomBytes(32).toString('base64url');
  codes.set(code, {
    clientId,
    redirectUri,
    codeChallenge: form.get('code_challenge') ?? '',
    nonce: form.get('nonce') ?? '',
    account,
    expiresAt: Date.now() + 120_000,
  });
  destination.searchParams.set('code', code);
  response.writeHead(303, { location: destination.toString(), 'cache-control': 'no-store' });
  response.end();
}

async function token(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const form = await readForm(request);
  const code = form.get('code') ?? '';
  const grant = codes.get(code);
  codes.delete(code);
  if (
    !grant ||
    grant.expiresAt <= Date.now() ||
    form.get('grant_type') !== 'authorization_code' ||
    form.get('client_id') !== grant.clientId ||
    form.get('client_secret') !== clientSecret ||
    form.get('redirect_uri') !== grant.redirectUri
  ) {
    return json(response, 400, { error: 'invalid_grant' });
  }
  const verifier = form.get('code_verifier') ?? '';
  const challenge = pkceChallenge(verifier);
  if (challenge !== grant.codeChallenge) return json(response, 400, { error: 'invalid_grant' });
  const now = Math.floor(Date.now() / 1000);
  const idToken = await new SignJWT({
    email: grant.account.email,
    email_verified: true,
    name: grant.account.name,
    nonce: grant.nonce,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(clientId)
    .setSubject(grant.account.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  return json(response, 200, {
    access_token: randomBytes(32).toString('base64url'),
    token_type: 'Bearer',
    expires_in: 300,
    id_token: idToken,
  });
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', issuer);
    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (request.method === 'GET' && url.pathname === '/jwks') {
      return json(response, 200, { keys: [publicJwk] });
    }
    if (request.method === 'GET' && url.pathname === '/authorize') {
      return authorizeGet(url, response);
    }
    if (request.method === 'POST' && url.pathname === '/authorize') {
      return authorizePost(request, response);
    }
    if (request.method === 'POST' && url.pathname === '/token') {
      return token(request, response);
    }
    return json(response, 404, { error: 'not_found' });
  })().catch(() => json(response, 500, { error: 'server_error' }));
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
