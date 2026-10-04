import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ObjectStorage } from '@dike/storage';
import { API_CONFIG } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
export const FILE_STORAGE = Symbol('FILE_STORAGE');
@Global()
@Module({})
export class StorageModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: StorageModule,
      providers: enabled
        ? [
            {
              provide: FILE_STORAGE,
              inject: [API_CONFIG],
              useFactory: (config: ApiConfig) => new ObjectStorage(config),
            },
          ]
        : [],
      exports: enabled ? [FILE_STORAGE] : [],
    };
  }
}
