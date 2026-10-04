import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { API_CONFIG } from '../common/tokens.js';
import { CryptoService } from './crypto.service.js';
import type { EncryptedValue, OAuthTransaction } from './auth.types.js';

@Injectable()
export class OAuthTransactionStore {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  async create(transaction: OAuthTransaction): Promise<{ token: string; expiresAt: Date }> {
    const token = this.crypto.randomToken();
    const key = `auth:oauth:${this.crypto.transactionKey(token)}`;
    const encrypted = this.crypto.encryptTransaction(JSON.stringify(transaction));
    const stored = await this.redis.set(
      key,
      JSON.stringify(encrypted),
      'EX',
      this.config.AUTH_TRANSACTION_TTL_SECONDS,
      'NX',
    );
    if (stored !== 'OK') throw new Error('Unable to allocate OAuth transaction');
    return {
      token,
      expiresAt: new Date(Date.now() + this.config.AUTH_TRANSACTION_TTL_SECONDS * 1000),
    };
  }

  async consume(token: string): Promise<OAuthTransaction | null> {
    const key = `auth:oauth:${this.crypto.transactionKey(token)}`;
    const serialized = await this.redis.getdel(key);
    if (!serialized) return null;
    const encrypted = JSON.parse(serialized) as EncryptedValue;
    return JSON.parse(this.crypto.decryptTransaction(encrypted)) as OAuthTransaction;
  }
}
