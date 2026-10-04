import { describe, expect, it } from 'vitest';

import { loadApiConfig, openApiConfig } from '../src/config/api-config.js';

describe('API configuration', () => {
  function serialized(config = openApiConfig()): NodeJS.ProcessEnv {
    return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, String(value)]));
  }

  it('fails fast without required infrastructure settings', () => {
    expect(() => loadApiConfig({ APP_ENV: 'local' })).toThrow('Invalid API environment');
  });

  it('provides deterministic offline OpenAPI settings', () => {
    expect(openApiConfig().MONGODB_URI).toContain('offline.invalid');
  });

  it('keeps mock auth and phone bypass out of hosted environments', () => {
    const base = openApiConfig();
    expect(base.AUTH_PROVIDER).toBe('mock');
    expect(base.REQUIRE_PHONE_OTP).toBe(false);
  });

  it('rejects shared or placeholder key material in production', () => {
    const environment = {
      ...serialized(),
      APP_ENV: 'production',
      AUTH_PROVIDER: 'google',
      REQUIRE_PHONE_OTP: 'true',
      WEB_BASE_URL: 'https://dike.example',
      GOOGLE_REDIRECT_URI: 'https://dike.example/api/auth/google/callback',
      GOOGLE_CLIENT_SECRET: 'production-google-secret-with-enough-bytes',
    };
    expect(() => loadApiConfig(environment)).toThrow('Invalid API environment configuration');
  });

  it('accepts independent production keyrings', () => {
    const keyring = (character: string) => JSON.stringify({ current: character.repeat(40) });
    const environment = {
      ...serialized(),
      APP_ENV: 'production',
      AUTH_PROVIDER: 'google',
      REQUIRE_PHONE_OTP: 'true',
      WEB_BASE_URL: 'https://dike.example',
      GOOGLE_REDIRECT_URI: 'https://dike.example/api/auth/google/callback',
      GOOGLE_CLIENT_SECRET: 'production-google-secret-with-enough-bytes',
      AUTH_TOKEN_KEYRING: keyring('a'),
      AUTH_TOKEN_ACTIVE_KEY_ID: 'current',
      PII_KEYRING: keyring('b'),
      PII_ACTIVE_KEY_ID: 'current',
      CSRF_KEYRING: keyring('c'),
      CSRF_ACTIVE_KEY_ID: 'current',
      BFF_KEYRING: keyring('d'),
      BFF_ACTIVE_KEY_ID: 'current',
    };
    expect(loadApiConfig(environment).APP_ENV).toBe('production');
  });
});
