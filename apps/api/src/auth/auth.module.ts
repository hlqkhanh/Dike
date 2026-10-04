import { Module, type DynamicModule } from '@nestjs/common';
import { AuthCoreModule } from './auth-core.module.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module.js';
@Module({})
export class AuthModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        AuthCoreModule.register(enabled),
        AuthorizationModule.register(enabled),
        PhoneVerificationModule.register(enabled),
      ],
      controllers: [AuthController, MeController],
      exports: [AuthorizationModule],
    };
  }
}
