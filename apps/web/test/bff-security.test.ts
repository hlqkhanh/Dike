import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnvironment = { ...process.env };

async function loadBff(environment: Record<string, string>) {
  Object.assign(process.env, environment);
  vi.resetModules();
  return import('../lib/server/bff');
}

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

describe('BFF security boundary', () => {
  const localEnvironment = {
    APP_ENV: 'test',
    API_INTERNAL_URL: 'http://127.0.0.1:3001/api/v1',
    WEB_BASE_URL: 'http://localhost:3000',
    BFF_ACTIVE_KEY_ID: 'test',
    BFF_KEYRING: JSON.stringify({ test: 'bff-unit-key-material-at-least-32-bytes' }),
  };

  it('accepts only fixed application return paths', async () => {
    const { authReturnPath } = await loadBff(localEnvironment);
    expect(authReturnPath(null)).toBe('/app');
    expect(authReturnPath('/settings/sessions')).toBe('/settings/sessions');
    for (const malicious of [
      'https://evil.invalid',
      '//evil.invalid',
      '/%2e%2e/admin',
      '/app\\evil',
      '/unknown',
    ]) {
      expect(authReturnPath(malicious)).toBeNull();
    }
  });

  it('requires exact origin and double-submit CSRF for mutations', async () => {
    const { requireMutationSecurity } = await loadBff(localEnvironment);
    const rejected = new NextRequest('http://localhost:3000/api/auth/logout-all', {
      method: 'POST',
      headers: {
        origin: 'https://evil.invalid',
        cookie: 'dike_csrf=csrf-value-that-is-long-enough',
        'x-csrf-token': 'csrf-value-that-is-long-enough',
      },
    });
    expect(() => requireMutationSecurity(rejected)).toThrow('Request origin is not allowed');

    const accepted = new NextRequest('http://localhost:3000/api/auth/logout-all', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'dike_csrf=csrf-value-that-is-long-enough',
        'x-csrf-token': 'csrf-value-that-is-long-enough',
      },
    });
    expect(requireMutationSecurity(accepted)).toBe('csrf-value-that-is-long-enough');
  });

  it('sets HttpOnly session cookies and production Secure prefixes', async () => {
    const { setSessionCookies } = await loadBff({
      ...localEnvironment,
      APP_ENV: 'production',
      WEB_BASE_URL: 'https://dike.invalid',
      BFF_KEYRING: JSON.stringify({ test: 'z'.repeat(40) }),
    });
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, {
      accessToken: 'opaque-access',
      refreshToken: 'opaque-refresh',
      session: { csrfToken: 'csrf-value-that-is-long-enough' },
    });
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('__Host-dike_access=opaque-access');
    expect(cookies).toContain('__Secure-dike_refresh=opaque-refresh');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('Secure');
    expect(cookies).toContain('SameSite=lax');
  });
});
