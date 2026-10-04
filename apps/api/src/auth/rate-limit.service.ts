import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { ApiError } from '../common/api-error.js';
import { API_CONFIG, REDIS_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';

@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redisKey = `${this.config.AUTH_RATE_LIMIT_PREFIX}:${key}`;
    const value = await this.redis.incr(redisKey);
    if (value === 1) await this.redis.expire(redisKey, windowSeconds);
    if (value > limit) {
      const ttl = Math.max(await this.redis.ttl(redisKey), 1);
      throw new ApiError(
        'RATE_LIMITED',
        `Too many requests. Retry after ${ttl} seconds`,
        429,
        undefined,
        ttl,
      );
    }
  }
}
