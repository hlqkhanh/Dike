import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from '../src/config.js';

const base = {
  APP_ENV: 'test',
  LOG_LEVEL: 'error',
  MONGODB_URI: 'mongodb://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
};

describe('worker configuration', () => {
  it('applies safe bounded defaults', () => {
    expect(loadWorkerConfig(base).attempts).toBe(5);
  });

  it('rejects unsafe concurrency', () => {
    expect(() => loadWorkerConfig({ ...base, WORKER_CONCURRENCY: '100' })).toThrow();
  });
});
