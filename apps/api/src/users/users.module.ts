import { Module, type DynamicModule } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
@Module({})
export class UsersModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: UsersModule,
      imports: [AuthCoreModule.register(enabled), AuthorizationModule.register(enabled)],
      controllers: [UsersController],
      providers: enabled ? [UsersService] : [],
    };
  }
}
