import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const rootDirectory = resolve(import.meta.dirname, '..');
export const localEnvPath = resolve(rootDirectory, '.env.local');

function secret(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function ensureLocalEnvironment() {
  if (existsSync(localEnvPath)) {
    const existing = readFileSync(localEnvPath, 'utf8');
    const names = new Set(
      existing
        .split(/\r?\n/u)
        .map((line) => line.match(/^([A-Z0-9_]+)=/u)?.[1])
        .filter(Boolean),
    );
    const additions = stageTwoEnvironment().filter(
      (line) => line && !names.has(line.slice(0, line.indexOf('='))),
    );
    if (additions.length > 0) {
      appendFileSync(localEnvPath, `\n${additions.join('\n')}\n`, { encoding: 'utf8' });
      console.log('[env] Added missing local-only settings to .env.local.');
    }
    return localEnvPath;
  }
  const redisPassword = secret();
  const accessKey = `dike${randomBytes(8).toString('hex')}`;
  const secretKey = secret(32);
  const content = [
    'NODE_ENV=development',
    'APP_ENV=local',
    'LOG_LEVEL=debug',
    'API_PORT=3001',
    'WEB_PORT=3000',
    'WEB_ORIGIN=http://localhost:3000',
    'NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1',
    'MONGODB_URI=mongodb://127.0.0.1:27017/dike?replicaSet=rs0',
    `REDIS_URL=redis://:${redisPassword}@127.0.0.1:6379/0`,
    `REDIS_PASSWORD=${redisPassword}`,
    'S3_ENDPOINT=http://127.0.0.1:9000',
    'S3_BUCKET_PUBLIC=dike-local-public',
    'S3_BUCKET_PRIVATE=dike-local-private',
    `S3_ACCESS_KEY=${accessKey}`,
    `S3_SECRET_KEY=${secretKey}`,
    'S3_REGION=us-east-1',
    'WORKER_CONCURRENCY=2',
    'WORKER_JOB_ATTEMPTS=5',
    'WORKER_POLL_INTERVAL_MS=1000',
    ...stageTwoEnvironment(),
    '',
  ].join('\n');
  writeFileSync(localEnvPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log('[env] Created .env.local with local-only random credentials.');
  return localEnvPath;
}

function stageTwoEnvironment() {
  const keyring = (prefix) => JSON.stringify({ local: `${prefix}${secret(32)}` });
  return [
    'EKYC_PROVIDER=mock',
    `EKYC_WEBHOOK_SECRET=${secret(32)}`,
    'EKYC_CALLBACK_URL=http://127.0.0.1:3001/api/v1/webhooks/ekyc/mock',
    'S3_PUBLIC_BASE_URL=http://127.0.0.1:9000/dike-local-public',
    'RETENTION_POLICY_APPROVED=false',
    'AUTH_PROVIDER=mock',
    'GOOGLE_CLIENT_ID=dike-local-client',
    `GOOGLE_CLIENT_SECRET=${secret(32)}`,
    'GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback',
    'MOCK_OIDC_ISSUER=http://127.0.0.1:3002',
    'WEB_BASE_URL=http://localhost:3000',
    'API_INTERNAL_URL=http://127.0.0.1:3001/api/v1',
    'AUTH_ACCESS_TTL_SECONDS=900',
    'AUTH_REFRESH_ABSOLUTE_TTL_SECONDS=2592000',
    'AUTH_REFRESH_REUSE_GRACE_SECONDS=10',
    'AUTH_MAX_SESSIONS=10',
    'AUTH_TRANSACTION_TTL_SECONDS=600',
    'AUTH_RATE_LIMIT_PREFIX=auth:rate',
    `AUTH_TOKEN_KEYRING=${keyring('auth-')}`,
    'AUTH_TOKEN_ACTIVE_KEY_ID=local',
    `PII_KEYRING=${keyring('pii-')}`,
    'PII_ACTIVE_KEY_ID=local',
    `CSRF_KEYRING=${keyring('csrf-')}`,
    'CSRF_ACTIVE_KEY_ID=local',
    `BFF_KEYRING=${keyring('bff-')}`,
    'BFF_ACTIVE_KEY_ID=local',
    `OTP_CODE_KEYRING=${keyring('otp-')}`,
    'OTP_CODE_ACTIVE_KEY_ID=local',
    'OTP_PROVIDER=fake',
    'OTP_DEV_EXPOSE_CODE=true',
    'REQUIRE_PHONE_OTP=true',
    'TRUST_PROXY_HOPS=0',
  ];
}
