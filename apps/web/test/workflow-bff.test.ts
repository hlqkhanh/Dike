import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const original = { ...process.env };
const id = 'a'.repeat(24);
const csrf = 'csrf-test-token-with-enough-characters';
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
function request(origin = 'http://localhost:3000', token = true) {
  return new NextRequest(`http://localhost:3000/api/admin/vehicles/${id}/decision`, {
    method: 'POST',
    headers: {
      origin,
      cookie: `dike_access=opaque; dike_csrf=${csrf}`,
      ...(token ? { 'x-csrf-token': csrf } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      expectedVersion: 2,
      commandId: '77b88f69-a9bc-4f3f-b6f9-2dcf5dd01572',
      action: 'APPROVE',
      reason: 'Synthetic review',
    }),
  });
}
describe('Stage 5 fixed BFF routes', () => {
  it('blocks cross-origin, missing CSRF and path injection without an upstream request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { POST } = await import('../app/api/admin/vehicles/[id]/decision/route');
    expect(
      (await POST(request('https://other.invalid'), { params: Promise.resolve({ id }) })).status,
    ).toBe(403);
    expect(
      (await POST(request(undefined, false), { params: Promise.resolve({ id }) })).status,
    ).toBe(403);
    expect(
      (await POST(request(), { params: Promise.resolve({ id: '../memberships' }) })).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([403, 404, 409, 429])(
    'preserves upstream %s and signs the concrete resource path',
    async (status) => {
      let captured: Request | undefined;
      vi.stubGlobal('fetch', (input: Request) => {
        captured = input;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'WORKFLOW_TEST_ERROR', message: 'Test', requestId: 'test' },
            }),
            { status, headers: { 'content-type': 'application/json', 'retry-after': '30' } },
          ),
        );
      });
      const { POST } = await import('../app/api/admin/vehicles/[id]/decision/route');
      const response = await POST(request(), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store, private');
      expect(response.headers.get('retry-after')).toBe('30');
      expect(captured?.url).toBe(`http://127.0.0.1:3001/api/v1/admin/vehicles/${id}/decision`);
      expect(captured?.headers.get('x-dike-bff-signature')).toBeTruthy();
      expect(await captured?.json()).toMatchObject({ expectedVersion: 2, action: 'APPROVE' });
    },
  );
  it('never forwards arbitrary query destinations or cookies', async () => {
    let captured: Request | undefined;
    vi.stubGlobal('fetch', (input: Request) => {
      captured = input;
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    });
    const { GET } = await import('../app/api/admin/vehicles/route');
    await GET(
      new NextRequest(
        'http://localhost:3000/api/admin/vehicles?url=https://other.invalid&limit=20&status=PENDING',
        { headers: { cookie: 'dike_access=opaque; arbitrary=private' } },
      ),
    );
    expect(captured?.url).toBe(
      'http://127.0.0.1:3001/api/v1/admin/vehicles?limit=20&status=PENDING',
    );
    expect(captured?.headers.get('cookie')).toBeNull();
  });
});
