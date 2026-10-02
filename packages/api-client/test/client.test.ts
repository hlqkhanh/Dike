import { describe, expect, it, vi } from 'vitest';

import { createDikeClient } from '../src/index.js';

describe('generated API client wrapper', () => {
  it('uses the configured base URL and request ID', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', requestId: 'request-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createDikeClient({
      baseUrl: 'http://localhost:3001/api/v1/',
      fetch,
      requestId: '3bbcee75-cecc-42eb-8bea-3ff727e9ef77',
    });

    await client.GET('/health/live');
    expect(fetch).toHaveBeenCalledOnce();
    const [request] = fetch.mock.calls[0] ?? [];
    expect((request as Request).url).toBe('http://localhost:3001/api/v1/health/live');
    expect((request as Request).headers.get('x-request-id')).toBe(
      '3bbcee75-cecc-42eb-8bea-3ff727e9ef77',
    );
  });
});
