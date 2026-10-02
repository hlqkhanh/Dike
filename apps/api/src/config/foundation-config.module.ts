import { Global, Module, type DynamicModule } from '@nestjs/common';

import { API_CONFIG } from '../common/tokens.js';
import { API_LOGGER } from '../common/tokens.js';
import { createLogger } from '../common/logger.js';
import { RequestContext } from '../common/request-context.js';
import type { ApiConfig } from './api-config.js';

@Global()
@Module({})
export class FoundationConfigModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: FoundationConfigModule,
      providers: [
        { provide: API_CONFIG, useValue: config },
        { provide: API_LOGGER, useValue: createLogger(config) },
        RequestContext,
      ],
      exports: [API_CONFIG, API_LOGGER, RequestContext],
    };
  }
}
