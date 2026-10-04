import { UsersModule } from './users/users.module.js';
import { FilesModule } from './files/files.module.js';
import { StorageModule } from './files/storage.module.js';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { RequestContextMiddleware } from './common/request-context.middleware.js';
import { RequestLoggerMiddleware } from './common/request-logger.middleware.js';
import type { ApiConfig } from './config/api-config.js';
import { FoundationConfigModule } from './config/foundation-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { AuthModule } from './auth/auth.module.js';

export interface AppModuleOptions {
  config: ApiConfig;
  connectInfrastructure: boolean;
}

@Module({})
export class AppModule implements NestModule {
  static register(options: AppModuleOptions) {
    return {
      module: AppModule,
      imports: [
        FoundationConfigModule.register(options.config),
        ...(options.connectInfrastructure ? [DatabaseModule, OutboxModule] : []),
        AuthModule.register(options.connectInfrastructure),
        StorageModule.register(options.connectInfrastructure),
        UsersModule.register(options.connectInfrastructure),
        FilesModule.register(options.connectInfrastructure),
        HealthModule,
      ],
      providers: [RequestContextMiddleware, RequestLoggerMiddleware],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
