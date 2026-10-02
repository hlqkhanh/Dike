import pino, { type Logger } from 'pino';

import type { ApiConfig } from '../config/api-config.js';

export function createLogger(config: ApiConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.otp',
        '*.mongodbUri',
        '*.redisUrl',
        '*.s3SecretKey',
      ],
      censor: '[REDACTED]',
    },
    base: { service: 'dike-api', environment: config.APP_ENV },
  });
}
