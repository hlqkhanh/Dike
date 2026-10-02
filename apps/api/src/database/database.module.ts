import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import mongoose, { type Connection } from 'mongoose';
import type { Logger } from 'pino';

import { API_CONFIG, API_LOGGER, MONGO_CONNECTION, REDIS_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { TransactionManager } from './transaction-manager.js';

class InfrastructureShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(MONGO_CONNECTION) private readonly mongo: Connection,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.mongo.close(), this.redis.quit()]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CONNECTION,
      inject: [API_CONFIG],
      useFactory: async (config: ApiConfig) =>
        mongoose
          .createConnection(config.MONGODB_URI, {
            autoIndex: config.APP_ENV === 'local' || config.APP_ENV === 'test',
            serverSelectionTimeoutMS: 5_000,
            socketTimeoutMS: 10_000,
            maxPoolSize: 10,
          })
          .asPromise(),
    },
    {
      provide: REDIS_CONNECTION,
      inject: [API_CONFIG, API_LOGGER],
      useFactory: async (config: ApiConfig, logger: Logger) => {
        const redis = new Redis(config.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
        });
        redis.on('error', (error) => {
          logger.warn({ errorType: error.name }, 'redis connection error');
        });
        await redis.connect();
        return redis;
      },
    },
    InfrastructureShutdown,
    TransactionManager,
  ],
  exports: [MONGO_CONNECTION, REDIS_CONNECTION, TransactionManager],
})
export class DatabaseModule {}
