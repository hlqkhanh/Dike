import { describe, expect, it } from 'vitest';

import { loadApiConfig, openApiConfig } from '../src/config/api-config.js';

describe('API configuration', () => {
  it('fails fast without required infrastructure settings', () => {
    expect(() => loadApiConfig({ APP_ENV: 'local' })).toThrow('Invalid API environment');
  });

  it('provides deterministic offline OpenAPI settings', () => {
    expect(openApiConfig().MONGODB_URI).toContain('offline.invalid');
  });
});
