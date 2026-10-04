import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const original = { ...process.env };
beforeEach(() => {
  Object.assign(process.env, {
    APP_ENV: 'test',
    API_INTERNAL_URL: 'http://127.0.0.1:3001/api/v1',
    WEB_BASE_URL: 'http://localhost:3000',
    BFF_KEYRING: JSON.stringify({ test: 'bff-unit-key-material-at-least-32-bytes' }),
    BFF_ACTIVE_KEY_ID: 'test',
  });
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('OTP BFF endpoints', () => {
  const csrf = 'csrf-test-token-with-enough-characters';
  function request(origin = 'http://localhost:3000', includeCsrf = true) {
    return new NextRequest('http://localhost:3000/api/auth/phone/verification/start', {
      method: 'POST',
      headers: {
        origin,
        cookie: `dike_access=opaque; dike_csrf=${csrf}`,
        ...(includeCsrf ? { 'x-csrf-token': csrf } : {}),
      },
    });
  }
  it('rejects cross-origin and missing-CSRF mutations before contacting the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { POST } = await import('../app/api/auth/phone/verification/start/route');
    expect((await POST(request('https://attacker.invalid'))).status).toBe(403);
    expect((await POST(request('http://localhost:3000', false))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('signs only the fixed route and preserves Retry-After with no-store', async () => {
    let captured: Request | undefined;
    vi.stubGlobal('fetch', (input: Request) => {
      captured = input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'OTP_RESEND_TOO_SOON', message: 'Wait', requestId: 'test' },
          }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '45' } },
        ),
      );
    });
    const { POST } = await import('../app/api/auth/phone/verification/start/route');
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('45');
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(captured?.url).toBe('http://127.0.0.1:3001/api/v1/auth/phone/verification/start');
    expect(captured?.headers.get('x-dike-bff-signature')).toBeTruthy();
  });
  it('requests a session refresh when the access cookie has expired', async () => {
    const { POST } = await import('../app/api/auth/phone/verification/start/route');
    const response = await POST(
      new NextRequest('http://localhost:3000/api/auth/phone/verification/start', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: `dike_csrf=${csrf}`,
          'x-csrf-token': csrf,
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'SESSION_REFRESH_REQUIRED' } });
  });
});
