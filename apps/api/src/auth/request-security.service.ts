import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  BFF_KEY_ID_HEADER,
  BFF_NONCE_HEADER,
  BFF_SIGNATURE_HEADER,
  BFF_TIMESTAMP_HEADER,
  REQUEST_ID_HEADER,
} from '@dike/contracts';
import type { Request } from 'express';
import type { Redis } from 'ioredis';

import { ApiError } from '../common/api-error.js';
import { REDIS_CONNECTION } from '../common/tokens.js';
import { CryptoService } from './crypto.service.js';

type RawRequest = Request & { rawBody?: Buffer };

@Injectable()
export class RequestSecurityService {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  async verify(request: RawRequest): Promise<void> {
    const keyId = request.header(BFF_KEY_ID_HEADER);
    const timestamp = request.header(BFF_TIMESTAMP_HEADER);
    const nonce = request.header(BFF_NONCE_HEADER);
    const signature = request.header(BFF_SIGNATURE_HEADER);
    const requestId = request.header(REQUEST_ID_HEADER) ?? '';
    if (!keyId || !timestamp || !nonce || !signature || !this.crypto.hasBffKey(keyId)) {
      throw this.unauthorized();
    }
    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 30_000) {
      throw this.unauthorized();
    }
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) throw this.unauthorized();
    const replayKey = `auth:bff-nonce:${keyId}:${nonce}`;
    const accepted = await this.redis.set(replayKey, '1', 'EX', 120, 'NX');
    if (accepted !== 'OK') throw this.unauthorized();
    const bodyHash = createHash('sha256')
      .update(request.rawBody ?? Buffer.alloc(0))
      .digest('hex');
    const canonical = [
      request.method.toUpperCase(),
      request.path,
      requestId,
      timestamp,
      nonce,
      bodyHash,
    ].join('\n');
    const expected = this.crypto.signBff(canonical, keyId);
    if (!this.crypto.safeEqual(expected, signature)) {
      await this.redis.del(replayKey);
      throw this.unauthorized();
    }
  }

  private unauthorized(): ApiError {
    return new ApiError(
      'INTERNAL_CLIENT_UNAUTHORIZED',
      'Internal client authentication failed',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
