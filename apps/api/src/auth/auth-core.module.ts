import { Module, type DynamicModule } from '@nestjs/common';

import { AUTH_APPLICATION } from '../common/tokens.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { CryptoService } from './crypto.service.js';
import { IdentityProviderService } from './identity-provider.service.js';
import { OAuthTransactionStore } from './oauth-transaction.store.js';
import { AuthRateLimitService } from './rate-limit.service.js';
import { RequestSecurityService } from './request-security.service.js';
import { UnavailableAuthService } from './unavailable-auth.service.js';

@Module({})
export class AuthCoreModule {
  static register(enabled: boolean): DynamicModule {
    const runtimeProviders = [
      CryptoService,
      AuthRepository,
      IdentityProviderService,
      OAuthTransactionStore,
      RequestSecurityService,
      AuthRateLimitService,
      AuthService,
      { provide: AUTH_APPLICATION, useExisting: AuthService },
    ];
    return {
      module: AuthCoreModule,
      exports: enabled
        ? [AUTH_APPLICATION, AuthService, CryptoService, AuthRateLimitService]
        : [AUTH_APPLICATION],
      providers: enabled
        ? runtimeProviders
        : [
            UnavailableAuthService,
            { provide: AUTH_APPLICATION, useExisting: UnavailableAuthService },
          ],
    };
  }
}
