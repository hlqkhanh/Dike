import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { demand } from './model.js';
export const callbackSchema = z
  .object({
    eventId: z.uuid(),
    applicationId: z.string().regex(/^[a-f0-9]{24}$/),
    providerRef: z.uuid(),
    attempt: z.number().int().min(1),
    result: z.enum(['PASS', 'FAIL', 'EXPIRED']),
  })
  .strict();
export type CallbackPayload = z.infer<typeof callbackSchema>;
export interface EkycProvider {
  createSession(): { providerRef: string };
  verifyWebhook(raw: Buffer, timestamp: string, signature: string, now?: number): CallbackPayload;
}
export class MockEkycProvider implements EkycProvider {
  constructor(private readonly secret: string) {
    demand(secret.length >= 32, 'EKYC_NOT_CONFIGURED', 503);
  }
  createSession() {
    return { providerRef: randomUUID() };
  }
  sign(raw: Buffer, timestamp: string) {
    return createHmac('sha256', this.secret)
      .update(timestamp)
      .update('.')
      .update(raw)
      .digest('hex');
  }
  verifyWebhook(
    raw: Buffer,
    timestamp: string,
    signature: string,
    now = Date.now(),
  ): CallbackPayload {
    demand(
      raw.length <= 8192 &&
        /^\d{13}$/.test(timestamp) &&
        Math.abs(now - Number(timestamp)) <= 300000,
      'WEBHOOK_UNAUTHORIZED',
      401,
    );
    demand(
      /^[a-f0-9]{64}$/.test(signature) &&
        timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(this.sign(raw, timestamp), 'hex'),
        ),
      'WEBHOOK_UNAUTHORIZED',
      401,
    );
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8')) as unknown;
    } catch {
      demand(false, 'WEBHOOK_INVALID', 400);
    }
    const result = callbackSchema.safeParse(payload);
    demand(result.success, 'WEBHOOK_INVALID', 400);
    return result.data;
  }
}
