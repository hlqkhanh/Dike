import { Module, type DynamicModule } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
@Module({})
export class FilesModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: FilesModule,
      imports: [AuthCoreModule.register(enabled), AuthorizationModule.register(enabled)],
      controllers: [FilesController],
      providers: enabled ? [FilesService] : [],
    };
  }
}
