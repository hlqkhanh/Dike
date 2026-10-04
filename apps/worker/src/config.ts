import { storageConfigSchema, type StorageConfig } from '@dike/storage';
import { parseInteger } from '@dike/config';
import { z } from 'zod';

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
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
