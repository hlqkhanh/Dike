import { UnrecoverableError, type Job } from 'bullmq';
import {
  EKYC_EVENT,
  EKYC_DELIVERY,
  MockEkycProvider,
  WorkflowStore,
  callbackSchema,
} from '@dike/workflows';
import { FOUNDATION_SAMPLE_EVENT } from '@dike/contracts';
import { Types, type Connection } from 'mongoose';
import type { WorkerConfig } from './config.js';
import { createSampleHandler } from './sample-handler.js';
export function createWorkflowHandler(
  mongo: Connection,
  store: WorkflowStore,
  config: WorkerConfig,
) {
  const sample = createSampleHandler(mongo);
  return async (job: Job): Promise<unknown> => {
    if (job.name === FOUNDATION_SAMPLE_EVENT) return sample(job);
    if (config.EKYC_PROVIDER !== 'mock') throw new UnrecoverableError('eKYC is disabled');
    const data = job.data as Record<string, unknown>;
    if (job.name === EKYC_EVENT) {
      if (typeof data.callbackEventId !== 'string')
        throw new UnrecoverableError('Invalid callback event');
      return store.processCallback(data.callbackEventId);
    }
    if (job.name === EKYC_DELIVERY) {
      // Outbox adds its own eventId. The callback's id is kept separately.
      const payload = callbackSchema.safeParse({
        eventId: data.callbackEventId,
        applicationId: data.applicationId,
        providerRef: data.providerRef,
        attempt: data.attempt,
        result: data.result,
      });
      if (!payload.success) throw new UnrecoverableError('Invalid mock delivery');
      const record = await store.collection('verification').findOne({
        _id: new Types.ObjectId(payload.data.applicationId),
        status: 'PROVIDER_PENDING',
        active: true,
        expiresAt: { $gt: new Date() },
      });
      if (
        !record ||
        !(await mongo.collection('users').findOne({ _id: record.userId, status: 'ACTIVE' }))
      )
        return { ignored: true };
      const raw = Buffer.from(JSON.stringify(payload.data));
      const timestamp = String(Date.now());
      const provider = new MockEkycProvider(config.EKYC_WEBHOOK_SECRET);
      const response = await fetch(config.EKYC_CALLBACK_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-ekyc-key-id': 'local-v1',
          'x-ekyc-timestamp': timestamp,
          'x-ekyc-signature': provider.sign(raw, timestamp),
        },
        body: raw,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429)
          throw new UnrecoverableError('Callback rejected');
        throw new Error('Callback unavailable');
      }
      return { delivered: true };
    }
    throw new UnrecoverableError('Unknown event type');
  };
}
