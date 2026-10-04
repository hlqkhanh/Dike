import pino, { type Logger } from 'pino';

import type { ApiConfig } from '../config/api-config.js';

export function createLogger(config: ApiConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.set-cookie',
        'req.headers.x-dike-bff-signature',
        '*.authorization',
        '*.cookie',
        '*.code',
        '*.state',
        '*.nonce',
        '*.codeVerifier',
        '*.code_verifier',
        '*.idToken',
        '*.id_token',
        '*.accessToken',
        '*.refreshToken',
        '*.clientSecret',
        '*.client_secret',
        '*.phone',
        '*.email',
        '*.password',
        '*.token',
        '*.otp',
        '*.developmentCode',
        '*.providerReference',
        '*.mongodbUri',
        '*.redisUrl',
        '*.s3SecretKey',
      ],
      censor: '[REDACTED]',
    },
    base: { service: 'dike-api', environment: config.APP_ENV },
  });
}
