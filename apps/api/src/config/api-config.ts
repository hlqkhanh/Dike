import { z } from 'zod';

const forbiddenHostedSecret = /(replace|change|example|placeholder|test-secret|offline|012345)/i;

function keyringSecrets(serialized: string): string[] | null {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const secrets = Object.values(value);
    return secrets.every((secret) => typeof secret === 'string' && secret.length >= 32)
      ? (secrets as string[])
      : null;
  } catch {
    return null;
  }
}

const apiConfigSchema = z
  .object({
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
    S3_PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:9000/dike-local-public'),
    RETENTION_POLICY_APPROVED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    S3_REGION: z.string().min(1).default('us-east-1'),
    AUTH_PROVIDER: z.enum(['google', 'mock']).default('mock'),
    GOOGLE_CLIENT_ID: z.string().min(3),
    GOOGLE_CLIENT_SECRET: z.string().min(8),
    GOOGLE_REDIRECT_URI: z.string().url(),
    MOCK_OIDC_ISSUER: z.string().url().default('http://127.0.0.1:3002'),
    WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
    AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    AUTH_REFRESH_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(31_536_000)
      .default(2_592_000),
    AUTH_REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),
    AUTH_MAX_SESSIONS: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_TRANSACTION_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
    AUTH_RATE_LIMIT_PREFIX: z.string().min(1).max(100).default('auth:rate'),
    AUTH_TOKEN_KEYRING: z.string().min(20),
    AUTH_TOKEN_ACTIVE_KEY_ID: z.string().min(1),
    PII_KEYRING: z.string().min(20),
    PII_ACTIVE_KEY_ID: z.string().min(1),
    CSRF_KEYRING: z.string().min(20),
    CSRF_ACTIVE_KEY_ID: z.string().min(1),
    BFF_KEYRING: z.string().min(20),
    BFF_ACTIVE_KEY_ID: z.string().min(1),
    OTP_PROVIDER: z.enum(['fake', 'disabled']).default('disabled'),
    OTP_DEV_EXPOSE_CODE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    OTP_CODE_KEYRING: z.string().min(20),
    OTP_CODE_ACTIVE_KEY_ID: z.string().min(1),
    REQUIRE_PHONE_OTP: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  })
  .superRefine((config, context) => {
    const hosted = config.APP_ENV === 'staging' || config.APP_ENV === 'production';
    if (config.S3_BUCKET_PUBLIC === config.S3_BUCKET_PRIVATE)
      context.addIssue({
        code: 'custom',
        path: ['S3_BUCKET_PRIVATE'],
        message: 'Separate buckets required',
      });
    if (
      hosted &&
      (!config.S3_ENDPOINT.startsWith('https://') ||
        !config.S3_PUBLIC_BASE_URL.startsWith('https://'))
    )
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'Hosted storage requires HTTPS',
      });
    if (hosted && (config.OTP_PROVIDER === 'fake' || config.OTP_DEV_EXPOSE_CODE)) {
      context.addIssue({
        code: 'custom',
        path: ['OTP_PROVIDER'],
        message: 'Fake OTP and exposed codes are local/test only',
      });
    }
    if (hosted && config.AUTH_PROVIDER === 'mock') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_PROVIDER'],
        message: 'Mock auth is local/test only',
      });
    }
    if (hosted && !config.REQUIRE_PHONE_OTP) {
      context.addIssue({
        code: 'custom',
        path: ['REQUIRE_PHONE_OTP'],
        message: 'OTP bypass is local/test only',
      });
    }
    if (
      hosted &&
      (!config.WEB_BASE_URL.startsWith('https://') ||
        !config.GOOGLE_REDIRECT_URI.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WEB_BASE_URL'],
        message: 'Hosted auth requires HTTPS',
      });
    }
    const keyringFields = [
      'AUTH_TOKEN_KEYRING',
      'PII_KEYRING',
      'CSRF_KEYRING',
      'BFF_KEYRING',
      'OTP_CODE_KEYRING',
    ] as const;
    const purposeSecrets = keyringFields.map((field) => ({
      field,
      secrets: keyringSecrets(config[field]),
    }));
    for (const item of purposeSecrets) {
      const activeField = item.field.replace('_KEYRING', '_ACTIVE_KEY_ID') as
        | 'AUTH_TOKEN_ACTIVE_KEY_ID'
        | 'PII_ACTIVE_KEY_ID'
        | 'CSRF_ACTIVE_KEY_ID'
        | 'BFF_ACTIVE_KEY_ID'
        | 'OTP_CODE_ACTIVE_KEY_ID';
      if (
        item.secrets &&
        !Object.hasOwn(
          JSON.parse(config[item.field]) as Record<string, unknown>,
          config[activeField],
        )
      ) {
        context.addIssue({ code: 'custom', path: [activeField], message: 'Active key is absent' });
      }
      if (!item.secrets) {
        context.addIssue({
          code: 'custom',
          path: [item.field],
          message: 'Keyring must be valid JSON with secrets of at least 32 characters',
        });
      }
      if (hosted && item.secrets?.some((secret) => forbiddenHostedSecret.test(secret))) {
        context.addIssue({
          code: 'custom',
          path: [item.field],
          message: 'Hosted keyring contains a placeholder secret',
        });
      }
    }
    if (hosted) {
      const owners = new Map<string, string>();
      for (const item of purposeSecrets) {
        for (const secret of item.secrets ?? []) {
          const previous = owners.get(secret);
          if (previous && previous !== item.field) {
            context.addIssue({
              code: 'custom',
              path: [item.field],
              message: `Key material must not be shared with ${previous}`,
            });
          } else {
            owners.set(secret, item.field);
          }
        }
      }
      if (forbiddenHostedSecret.test(config.GOOGLE_CLIENT_SECRET)) {
        context.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_SECRET'],
          message: 'Hosted Google client secret must not be a placeholder',
        });
      }
    }
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
  const keyring = JSON.stringify({ local: '0123456789abcdef0123456789abcdef' });
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
    AUTH_PROVIDER: 'mock',
    GOOGLE_CLIENT_ID: 'openapi-client',
    GOOGLE_CLIENT_SECRET: 'openapi-secret-value',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
    MOCK_OIDC_ISSUER: 'http://127.0.0.1:3002',
    WEB_BASE_URL: 'http://localhost:3000',
    AUTH_TOKEN_KEYRING: keyring,
    AUTH_TOKEN_ACTIVE_KEY_ID: 'local',
    PII_KEYRING: keyring,
    PII_ACTIVE_KEY_ID: 'local',
    CSRF_KEYRING: keyring,
    CSRF_ACTIVE_KEY_ID: 'local',
    BFF_KEYRING: keyring,
    BFF_ACTIVE_KEY_ID: 'local',
    OTP_CODE_KEYRING: keyring,
    OTP_CODE_ACTIVE_KEY_ID: 'local',
    REQUIRE_PHONE_OTP: 'false',
    AUTH_RATE_LIMIT_PREFIX: 'auth:openapi',
  });
}
