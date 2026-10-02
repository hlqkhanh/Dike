import pino from 'pino';

import type { WorkerConfig } from './config.js';

export function createWorkerLogger(config: WorkerConfig) {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'dike-worker', environment: config.APP_ENV },
    redact: {
      paths: ['*.password', '*.token', '*.otp', '*.payload', '*.mongodbUri', '*.redisUrl'],
      censor: '[REDACTED]',
    },
  });
}
