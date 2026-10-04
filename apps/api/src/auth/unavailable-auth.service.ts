import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthSessionView, DeviceSessionView } from '@dike/contracts';

import { ApiError } from '../common/api-error.js';
import type { AuthApplication, SessionTokens } from './auth.types.js';

@Injectable()
export class UnavailableAuthService implements AuthApplication {
  verifyInternalRequest(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
  startGoogle(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  finishGoogle(): Promise<SessionTokens & { session: AuthSessionView; returnTo: string }> {
    return Promise.reject(this.unavailable());
  }
  getSession(): Promise<AuthSessionView> {
    return Promise.reject(this.unavailable());
  }
  refresh(): Promise<SessionTokens & { session: AuthSessionView }> {
    return Promise.reject(this.unavailable());
  }
  logout(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
  logoutAll(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
  listSessions(): Promise<DeviceSessionView[]> {
    return Promise.reject(this.unavailable());
  }
  revokeSession(): Promise<{ revokedCurrent: boolean }> {
    return Promise.reject(this.unavailable());
  }
  updatePhone(): Promise<AuthSessionView> {
    return Promise.reject(this.unavailable());
  }
  getMe(): Promise<AuthSessionView> {
    return Promise.reject(this.unavailable());
  }
  private unavailable(): ApiError {
    return new ApiError(
      'REQUEST_ERROR',
      'Authentication service is unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
