import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const rootDirectory = resolve(import.meta.dirname, '..');
export const localEnvPath = resolve(rootDirectory, '.env.local');

function secret(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function ensureLocalEnvironment() {
  if (existsSync(localEnvPath)) return localEnvPath;
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
    '',
  ].join('\n');
  writeFileSync(localEnvPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log('[env] Created .env.local with local-only random credentials.');
  return localEnvPath;
}
