import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from '../src/config.js';

const base = {
  APP_ENV: 'test',
  LOG_LEVEL: 'error',
  MONGODB_URI: 'mongodb://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET_PUBLIC: 'public-test',
  S3_BUCKET_PRIVATE: 'private-test',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-storage-secret-material',
};

describe('worker configuration', () => {
  it('applies safe bounded defaults', () => {
    expect(loadWorkerConfig(base).attempts).toBe(5);
  });

  it('rejects unsafe concurrency', () => {
    expect(() => loadWorkerConfig({ ...base, WORKER_CONCURRENCY: '100' })).toThrow();
  });
});
