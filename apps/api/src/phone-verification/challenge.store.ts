import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { API_CONFIG, REDIS_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { ApiError } from '../common/api-error.js';

export interface OtpChallenge {
  challengeId: string;
  userId: string;
  sessionIdHash: string;
  phoneLookupHash: string;
  phoneVersion: number;
  purpose: 'PHONE_VERIFICATION';
  provider: 'fake' | 'disabled';
  providerReference: string;
  status: 'PENDING' | 'PROVIDER_APPROVED' | 'CONSUMED' | 'EXHAUSTED';
  attemptsRemaining: number;
  issuedAt: number;
  expiresAt: number;
  resendAvailableAt: number;
  providerApprovedAt?: number;
}
export interface RateBucket {
  key: string;
  maximum: number;
  seconds: number;
}
export const MULTI_BUCKET_LUA = `
local wait = 0
for i,key in ipairs(KEYS) do
  if tonumber(redis.call('GET',key) or '0') >= tonumber(ARGV[(i-1)*2+1]) then
    wait = math.max(wait, redis.call('TTL',key), 1)
  end
end
if wait > 0 then return wait end
for i,key in ipairs(KEYS) do
  if redis.call('INCR',key) == 1 then redis.call('EXPIRE',key,ARGV[(i-1)*2+2]) end
end
return 0`;

@Injectable()
export class ChallengeStore {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private key(value: string) {
    return `${this.config.AUTH_RATE_LIMIT_PREFIX}:otp:${value}`;
  }
  private unavailable() {
    return new ApiError(
      'OTP_PROVIDER_UNAVAILABLE',
      'Phone verification is temporarily unavailable',
      503,
    );
  }
  async consume(buckets: RateBucket[]) {
    let retry: number;
    try {
      retry = Number(
        await this.redis.eval(
          MULTI_BUCKET_LUA,
          buckets.length,
          ...buckets.map((b) => this.key(`rate:${b.key}`)),
          ...buckets.flatMap((b) => [b.maximum, b.seconds]),
        ),
      );
    } catch {
      throw this.unavailable();
    }
    if (retry > 0) throw new ApiError('RATE_LIMITED', 'Please retry later', 429, undefined, retry);
  }
  async read(userId: string): Promise<OtpChallenge | null> {
    try {
      const value = await this.redis.get(this.key(`challenge:${userId}`));
      return value ? (JSON.parse(value) as OtpChallenge) : null;
    } catch {
      throw this.unavailable();
    }
  }
  async locked<T>(
    userId: string,
    work: (save: (value: OtpChallenge) => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const key = this.key(`lock:${userId}`);
    const owner = randomUUID();
    try {
      if ((await this.redis.set(key, owner, 'PX', 30_000, 'NX')) !== 'OK')
        throw new ApiError('OTP_RESEND_TOO_SOON', 'Verification is in progress', 429, undefined, 1);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw this.unavailable();
    }
    let lost = false;
    const renewal = setInterval(() => {
      void this.redis
        .eval(
          "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],30000) end return 0",
          1,
          key,
          owner,
        )
        .then((result) => {
          if (result !== 1) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 5000);
    try {
      return await work(async (value) => {
        if (lost) throw this.unavailable();
        try {
          const saved = await this.redis.eval(
            "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2],'EX',86400) return 1",
            2,
            key,
            this.key(`challenge:${userId}`),
            owner,
            JSON.stringify(value),
          );
          if (saved !== 1) throw this.unavailable();
        } catch {
          throw this.unavailable();
        }
      });
    } finally {
      clearInterval(renewal);
      await this.redis
        .eval(
          "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
          1,
          key,
          owner,
        )
        .catch(() => undefined);
    }
  }
}
