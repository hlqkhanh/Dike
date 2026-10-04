import { storageConfigSchema, type StorageConfig } from '@dike/storage';
import { parseInteger } from '@dike/config';
import { z } from 'zod';

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EKYC_PROVIDER: z.enum(['disabled', 'mock']).default('disabled'),
  EKYC_WEBHOOK_SECRET: z.string().default(''),
  EKYC_CALLBACK_URL: z.string().url().default('http://127.0.0.1:3001/api/v1/webhooks/ekyc/mock'),
});

export interface WorkerConfig extends z.infer<typeof baseSchema> {
  storage: StorageConfig;
  retentionEnabled: boolean;
  concurrency: number;
  attempts: number;
  pollIntervalMs: number;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = baseSchema.safeParse(environment);
  if (!parsed.success) throw new Error('Invalid worker environment configuration');
  if (parsed.data.EKYC_PROVIDER === 'mock') {
    const url = new URL(parsed.data.EKYC_CALLBACK_URL);
    if (
      !['local', 'test'].includes(parsed.data.APP_ENV) ||
      parsed.data.EKYC_WEBHOOK_SECRET.length < 32 ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/api/v1/webhooks/ekyc/mock'
    )
      throw new Error('Mock eKYC worker requires local/test credentials and a loopback callback');
  }
  return {
    ...parsed.data,
    storage: storageConfigSchema.parse(environment),
    retentionEnabled:
      ['local', 'test'].includes(parsed.data.APP_ENV) ||
      environment.RETENTION_POLICY_APPROVED === 'true',
    concurrency: parseInteger(environment.WORKER_CONCURRENCY, 2, { min: 1, max: 20 }),
    attempts: parseInteger(environment.WORKER_JOB_ATTEMPTS, 5, { min: 1, max: 10 }),
    pollIntervalMs: parseInteger(environment.WORKER_POLL_INTERVAL_MS, 1_000, {
      min: 50,
      max: 60_000,
    }),
  };
}
