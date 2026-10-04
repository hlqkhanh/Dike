import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileError, profileMessages } from '../lib/profile-client';

const originalEnvironment = { ...process.env };

async function loadProfileBff(environment: Record<string, string>) {
  Object.assign(process.env, environment);
  vi.resetModules();
  return import('../lib/server/profile-bff');
}

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

describe('profile BFF and client helpers', () => {
  const localEnvironment = {
    APP_ENV: 'test',
    API_INTERNAL_URL: 'http://127.0.0.1:3001/api/v1',
    WEB_BASE_URL: 'http://localhost:3000',
    BFF_ACTIVE_KEY_ID: 'test',
    BFF_KEYRING: JSON.stringify({ test: 'bff-unit-key-material-at-least-32-bytes' }),
  };

  it('rejects unauthenticated requests before calling API', async () => {
    const { profileHeaders } = await loadProfileBff(localEnvironment);
    const unauthenticated = new NextRequest('http://localhost:3000/api/me/profile');
    expect(() => profileHeaders(unauthenticated, false)).toThrow('Session refresh required');
  });

  it('binds bearer token and requires CSRF on mutations', async () => {
    const { profileHeaders } = await loadProfileBff(localEnvironment);
    const valid = new NextRequest('http://localhost:3000/api/me/profile', {
      method: 'PUT',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'dike_access=opaque-access-token; dike_csrf=valid-csrf-token-sample',
        'x-csrf-token': 'valid-csrf-token-sample',
      },
    });
    const headers = profileHeaders(valid, true);
    expect(headers.authorization).toBe('Bearer opaque-access-token');
    expect(headers['x-csrf-token']).toBe('valid-csrf-token-sample');
  });

  it('sets no-store cache-control header on successful response', async () => {
    const { profileResponse } = await loadProfileBff(localEnvironment);
    const mockResponse = new Response(JSON.stringify({ displayName: 'Alice' }), { status: 200 });
    const response = profileResponse({
      data: { displayName: 'Alice' },
      response: mockResponse,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
  });

  it('maps known error codes to Vietnamese messages and provides fallback', () => {
    expect(profileError(new Error('CONSENT_REQUIRED'))).toBe(profileMessages.CONSENT_REQUIRED);
    expect(profileError(new Error('FILE_INVALID'))).toBe(profileMessages.FILE_INVALID);
    expect(profileError(new Error('UNKNOWN_CODE'))).toBe(
      'Không thể hoàn tất. Vui lòng kiểm tra kết nối và thử lại.',
    );
  });
});
