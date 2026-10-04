import { ObjectStorage } from '@dike/storage';
import { FILE_STORAGE } from '../files/storage.module.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { HealthResponse } from '@dike/contracts';
import type { Redis } from 'ioredis';
import type { Connection } from 'mongoose';

import { MONGO_CONNECTION, REDIS_CONNECTION } from '../common/tokens.js';
import { RequestContext } from '../common/request-context.js';
import type { ApiConfig } from '../config/api-config.js';
import { API_CONFIG } from '../common/tokens.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(RequestContext) private readonly context: RequestContext,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Optional() @Inject(MONGO_CONNECTION) private readonly mongo?: Connection,
    @Optional() @Inject(REDIS_CONNECTION) private readonly redis?: Redis,
    @Optional() @Inject(FILE_STORAGE) private readonly storage?: ObjectStorage,
  ) {}

  live(): HealthResponse {
    return { status: 'ok', requestId: this.context.requestId };
  }

  async ready(): Promise<HealthResponse> {
    const checks = await Promise.all([
      this.check('otp', () => {
        if (this.config.REQUIRE_PHONE_OTP && this.config.OTP_PROVIDER === 'disabled')
          throw new Error('unavailable');
        return Promise.resolve();
      }),
      this.check('mongodb', async () => {
        if (!this.mongo?.db) throw new Error('unavailable');
        await this.mongo.db.admin().ping();
      }),
      this.check('redis', async () => {
        if (!this.redis) throw new Error('unavailable');
        await this.redis.ping();
      }),
      this.check('storage', async () => {
        if (this.storage) {
          await this.storage.ready();
          return;
        }
        if (['staging', 'production'].includes(this.config.APP_ENV)) throw new Error('unavailable');
        const response = await fetch(new URL('/minio/health/live', this.config.S3_ENDPOINT), {
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) throw new Error('unavailable');
      }),
    ]);
    const dependencies: Record<string, { status: 'up' | 'down' }> = {};
    for (const [name, health] of checks) dependencies[name] = health;
    const available = checks.every(([, health]) => health.status === 'up');
    return {
      status: available ? 'ok' : 'unavailable',
      requestId: this.context.requestId,
      dependencies,
    };
  }

  private async check(name: string, operation: () => Promise<void>) {
    try {
      await Promise.race([
        operation(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2_500)),
      ]);
      return [name, { status: 'up' as const }] as const;
    } catch {
      return [name, { status: 'down' as const }] as const;
    }
  }
}
