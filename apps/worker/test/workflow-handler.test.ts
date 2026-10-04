import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types, type Connection } from 'mongoose';
import type { Job } from 'bullmq';
import { EKYC_DELIVERY, EKYC_EVENT, MockEkycProvider, type WorkflowStore } from '@dike/workflows';
import { createWorkflowHandler } from '../src/workflow-handler.js';
import type { WorkerConfig } from '../src/config.js';
afterEach(() => vi.unstubAllGlobals());
describe('eKYC worker routing and transport', () => {
  const config = {
    EKYC_PROVIDER: 'mock',
    EKYC_WEBHOOK_SECRET: 'independent-unit-webhook-secret-material',
    EKYC_CALLBACK_URL: 'http://127.0.0.1:3001/api/v1/webhooks/ekyc/mock',
  } as WorkerConfig;
  function fixture(active = true) {
    const processCallback = vi.fn().mockResolvedValue({ processed: true });
    const store = {
      processCallback,
      collection: () => ({
        findOne: () => Promise.resolve(active ? { userId: new Types.ObjectId() } : null),
      }),
    } as unknown as WorkflowStore;
    const mongo = {
      collection: () => ({ findOne: () => Promise.resolve({ status: 'ACTIVE' }) }),
    } as unknown as Connection;
    return { processCallback, handler: createWorkflowHandler(mongo, store, config) };
  }
  function delivery() {
    return {
      name: EKYC_DELIVERY,
      data: {
        eventId: randomUUID(),
        callbackEventId: randomUUID(),
        applicationId: new Types.ObjectId().toHexString(),
        providerRef: randomUUID(),
        attempt: 1,
        result: 'PASS',
      },
    } as Job;
  }
  it('routes inbox events instead of applying the sample handler', async () => {
    const { handler, processCallback } = fixture();
    const id = randomUUID();
    await handler({ name: EKYC_EVENT, data: { callbackEventId: id } } as Job);
    expect(processCallback).toHaveBeenCalledWith(id);
    await expect(handler({ name: 'unknown', data: {} } as Job)).rejects.toThrow(
      'Unknown event type',
    );
  });
  it('signs HTTP callback bytes and keeps callback ID distinct from outbox ID', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(new Response('{}', { status: 201 }));
    });
    const job = delivery();
    await fixture().handler(job);
    const headers = new Headers(captured?.headers);
    const verified = new MockEkycProvider(config.EKYC_WEBHOOK_SECRET).verifyWebhook(
      captured?.body as Buffer,
      headers.get('x-ekyc-timestamp')!,
      headers.get('x-ekyc-signature')!,
    );
    expect(verified.eventId).toBe((job.data as { callbackEventId: string }).callbackEventId);
    expect(captured?.redirect).toBe('error');
  });
  it('retries transient failures and skips cancelled applications', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fixture().handler(delivery())).rejects.toThrow('Callback unavailable');
    fetch.mockClear();
    expect(await fixture(false).handler(delivery())).toEqual({ ignored: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
