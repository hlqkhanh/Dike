import { createHash, createHmac, hkdfSync, randomBytes, randomUUID } from 'node:crypto';

import { createDikeClient } from '@dike/api-client';
import {
  BFF_KEY_ID_HEADER,
  BFF_NONCE_HEADER,
  BFF_SIGNATURE_HEADER,
  BFF_TIMESTAMP_HEADER,
  REQUEST_ID_HEADER,
  type ApiErrorEnvelope,
} from '@dike/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { serverEnvironment } from './environment';

export const ACCESS_COOKIE = 'dike_access';
export const REFRESH_COOKIE = 'dike_refresh';
export const TRANSACTION_COOKIE = 'dike_oauth_tx';
export const CSRF_COOKIE = 'dike_csrf';
export type AuthReturnPath = '/app' | '/onboarding/phone' | '/settings/sessions';

const authReturnPaths = new Set<AuthReturnPath>([
  '/app',
  '/onboarding/phone',
  '/settings/sessions',
]);

export function authReturnPath(value: string | null): AuthReturnPath | null {
  const candidate = value ?? '/app';
  return authReturnPaths.has(candidate as AuthReturnPath) ? (candidate as AuthReturnPath) : null;
}

function cookieName(kind: 'access' | 'refresh' | 'transaction'): string {
  const { secureCookies } = serverEnvironment();
  if (!secureCookies) {
    return kind === 'access'
      ? ACCESS_COOKIE
      : kind === 'refresh'
        ? REFRESH_COOKIE
        : TRANSACTION_COOKIE;
  }
  return kind === 'access'
    ? '__Host-dike_access'
    : kind === 'refresh'
      ? '__Secure-dike_refresh'
      : '__Secure-dike_oauth_tx';
}

export function accessCookieName(): string {
  return cookieName('access');
}

export function refreshCookieName(): string {
  return cookieName('refresh');
}

export function transactionCookieName(): string {
  return cookieName('transaction');
}

function derive(key: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(key), Buffer.alloc(0), 'dike:bff-request', 32));
}

export function signedApiClient(
  method: string,
  path: string,
  body: unknown,
  additionalHeaders: HeadersInit = {},
) {
  const environment = serverEnvironment();
  const requestId = randomUUID();
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString('base64url');
  const serialized = body === undefined ? '' : JSON.stringify(body);
  const bodyHash = createHash('sha256').update(serialized).digest('hex');
  const canonicalPath = new URL(`${environment.apiInternalUrl}${path}`).pathname;
  const canonical = [
    method.toUpperCase(),
    canonicalPath,
    requestId,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');
  const key = environment.bffKeys[environment.bffActiveKeyId];
  if (!key) throw new Error('Active BFF key is unavailable');
  const signature = createHmac('sha256', derive(key)).update(canonical).digest('base64url');
  const headers = new Headers(additionalHeaders);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(BFF_KEY_ID_HEADER, environment.bffActiveKeyId);
  headers.set(BFF_TIMESTAMP_HEADER, timestamp);
  headers.set(BFF_NONCE_HEADER, nonce);
  headers.set(BFF_SIGNATURE_HEADER, signature);
  return createDikeClient({
    baseUrl: environment.apiInternalUrl,
    headers,
    fetch: async (request) => fetch(request, { cache: 'no-store', redirect: 'error' }),
  });
}

export function plainApiClient() {
  return createDikeClient({
    baseUrl: serverEnvironment().apiInternalUrl,
    fetch: async (request) => fetch(request, { cache: 'no-store', redirect: 'error' }),
  });
}

export function requireMutationSecurity(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin !== serverEnvironment().webBaseUrl) {
    throw new BffRequestError('ORIGIN_NOT_ALLOWED', 'Request origin is not allowed', 403);
  }
  const csrf = request.headers.get('x-csrf-token');
  const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;
  if (!csrf || csrf.length < 20 || csrf !== csrfCookie) {
    throw new BffRequestError('CSRF_INVALID', 'CSRF validation failed', 403);
  }
  return csrf;
}

export class BffRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function safeErrorResponse(error: unknown, fallbackStatus = 502): NextResponse {
  if (error instanceof BffRequestError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId: randomUUID() } },
      { status: error.status, headers: { 'cache-control': 'no-store, private' } },
    );
  }
  const envelope = error as Partial<ApiErrorEnvelope> | undefined;
  if (envelope?.error && typeof envelope.error.code === 'string') {
    const status =
      envelope.error.code === 'RATE_LIMITED'
        ? 429
        : envelope.error.code === 'SESSION_REFRESHED'
          ? 409
          : envelope.error.code === 'CSRF_INVALID' || envelope.error.code === 'ORIGIN_NOT_ALLOWED'
            ? 403
            : envelope.error.code.startsWith('SESSION_') || envelope.error.code.startsWith('OAUTH_')
              ? 401
              : fallbackStatus;
    return NextResponse.json(envelope, {
      status,
      headers: { 'cache-control': 'no-store, private' },
    });
  }
  return NextResponse.json(
    {
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Authentication service is unavailable',
        requestId: randomUUID(),
      },
    },
    { status: fallbackStatus, headers: { 'cache-control': 'no-store, private' } },
  );
}

export function setSessionCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string; session: { csrfToken: string } },
): void {
  const secure = serverEnvironment().secureCookies;
  response.cookies.set(accessCookieName(), tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 900,
  });
  response.cookies.set(refreshCookieName(), tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 2_592_000,
  });
  response.cookies.set(CSRF_COOKIE, tokens.session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 2_592_000,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  const secure = serverEnvironment().secureCookies;
  response.cookies.set(accessCookieName(), '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(refreshCookieName(), '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 0,
  });
  response.cookies.set(CSRF_COOKIE, '', {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export function clearTransactionCookie(response: NextResponse): void {
  response.cookies.set(transactionCookieName(), '', {
    httpOnly: true,
    secure: serverEnvironment().secureCookies,
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 0,
  });
}
