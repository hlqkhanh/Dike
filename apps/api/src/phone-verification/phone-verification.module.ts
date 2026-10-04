import { Module, type DynamicModule } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module.js';
import { PhoneVerificationController } from './phone-verification.controller.js';
import { PhoneVerificationService } from './phone-verification.service.js';
import { ChallengeStore } from './challenge.store.js';
@Module({})
export class PhoneVerificationModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: PhoneVerificationModule,
      imports: [AuthCoreModule.register(enabled)],
      controllers: [PhoneVerificationController],
      providers: enabled ? [PhoneVerificationService, ChallengeStore] : [],
    };
  }
}
