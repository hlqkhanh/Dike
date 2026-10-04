import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { HealthService } from '../src/health/health.service.js';
import { RequestContext } from '../src/common/request-context.js';
import { openApiConfig } from '../src/config/api-config.js';

describe('OTP readiness gate', () => {
  it('keeps liveness available but blocks readiness when phone verification is required without a provider', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 200 })));
    try {
      const mongo = {
        db: { admin: () => ({ ping: () => Promise.resolve() }) },
      } as unknown as Connection;
      const redis = { ping: () => Promise.resolve('PONG') } as unknown as Redis;
      const disabled = new HealthService(
        new RequestContext(),
        { ...openApiConfig(), REQUIRE_PHONE_OTP: true, OTP_PROVIDER: 'disabled' },
        mongo,
        redis,
      );
      expect(disabled.live().status).toBe('ok');
      expect(await disabled.ready()).toMatchObject({
        status: 'unavailable',
        dependencies: {
          mongodb: { status: 'up' },
          redis: { status: 'up' },
          minio: { status: 'up' },
          otp: { status: 'down' },
        },
      });
      const fake = new HealthService(
        new RequestContext(),
        { ...openApiConfig(), REQUIRE_PHONE_OTP: true, OTP_PROVIDER: 'fake' },
        mongo,
        redis,
      );
      expect((await fake.ready()).status).toBe('ok');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
