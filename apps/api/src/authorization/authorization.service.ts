import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { ApiError } from '../common/api-error.js';
import { effectiveRoles, satisfiesRoles, type RolePolicy } from './role-policy.js';

export const RequireRoles = (policy: RolePolicy) => SetMetadata('dike:roles', policy);

@Injectable()
export class AuthorizationService {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async require(accessToken: string, policy: RolePolicy) {
    const principal = await this.auth.requireAccess(accessToken);
    if (!satisfiesRoles(effectiveRoles(principal.user), policy))
      throw new ApiError('ROLE_REQUIRED', 'Required role is unavailable', 403);
    return principal;
  }
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header('authorization');
    const policy =
      this.reflector.getAllAndOverride<RolePolicy>('dike:roles', [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    await this.authorization.require(token?.startsWith('Bearer ') ? token.slice(7) : '', policy);
    return true;
  }
}
