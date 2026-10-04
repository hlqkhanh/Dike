import { afterEach, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/auth-client';
import { createCommandSender, workflowError } from '../lib/workflow-client';
import { uploadImage } from '../lib/file-upload';
afterEach(() => vi.unstubAllGlobals());
it('reuses command and payload after a lost response, but generates a new command for a new action', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValue(Response.json({ id: 'record' }));
  vi.stubGlobal('fetch', fetch);
  const send = createCommandSender();
  await expect(send('/api/me/vehicles', { model: 'Synthetic' })).rejects.toThrow('network');
  await send('/api/me/vehicles', { model: 'Synthetic' });
  const first = (fetch.mock.calls[0]?.[1] as RequestInit).body;
  expect((fetch.mock.calls[1]?.[1] as RequestInit).body).toBe(first);
  fetch.mockResolvedValue(Response.json({ id: 'other' }));
  await send('/api/me/vehicles', { model: 'Another' });
  expect((fetch.mock.calls[2]?.[1] as RequestInit).body).not.toBe(first);
});
it('shows rate limit delay and stale-version recovery in Vietnamese', () => {
  expect(workflowError(new ApiRequestError('RATE_LIMITED', 429, 45))).toContain('45 giây');
  expect(workflowError(new Error('VERSION_CONFLICT'))).toContain('tải lại');
});
it('rejects unsupported or oversized images before allocating an upload', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    uploadImage(new File(['svg'], 'test.svg', { type: 'image/svg+xml' }), 'IDENTITY_SANDBOX'),
  ).rejects.toThrow('FILE_INVALID');
  await expect(
    uploadImage(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'test.png', { type: 'image/png' }),
      'IDENTITY_SANDBOX',
    ),
  ).rejects.toThrow('FILE_INVALID');
  expect(fetch).not.toHaveBeenCalled();
});
