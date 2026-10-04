import { Module, type DynamicModule } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module.js';
import { AuthorizationService, AuthorizationGuard } from './authorization.service.js';
@Module({})
export class AuthorizationModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: AuthorizationModule,
      imports: [AuthCoreModule.register(enabled)],
      providers: enabled ? [AuthorizationService, AuthorizationGuard] : [],
      exports: enabled ? [AuthorizationService, AuthorizationGuard] : [],
    };
  }
}
