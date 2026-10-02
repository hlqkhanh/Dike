import { z } from 'zod';

const apiConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET_PUBLIC: z.string().min(3),
  S3_BUCKET_PRIVATE: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(8),
  S3_SECRET_KEY: z.string().min(16),
  S3_REGION: z.string().min(1).default('us-east-1'),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = apiConfigSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid API environment configuration: ${fields}`);
  }
  return result.data;
}

export function openApiConfig(): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    APP_ENV: 'test',
    LOG_LEVEL: 'error',
    API_PORT: '3001',
    WEB_ORIGIN: 'http://localhost:3000',
    MONGODB_URI: 'mongodb://offline.invalid/dike',
    REDIS_URL: 'redis://offline.invalid:6379',
    S3_ENDPOINT: 'http://offline.invalid:9000',
    S3_BUCKET_PUBLIC: 'dike-offline-public',
    S3_BUCKET_PRIVATE: 'dike-offline-private',
    S3_ACCESS_KEY: 'offline-access',
    S3_SECRET_KEY: 'offline-secret-value',
    S3_REGION: 'us-east-1',
  });
}
