import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AuthSessionView,
  DeviceSessionView,
  DeviceSummary,
  OnboardingNextAction,
} from '@dike/contracts';
import type { Request } from 'express';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Types } from 'mongoose';

import { ApiError } from '../common/api-error.js';
import { API_CONFIG } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { TransactionManager } from '../database/transaction-manager.js';
import { AuthRateLimitService } from './rate-limit.service.js';
import { AuthRepository } from './auth.repository.js';
import type {
  AuthApplication,
  SessionDocument,
  SessionTokens,
  UserDocument,
} from './auth.types.js';
import { CryptoService } from './crypto.service.js';
import { IdentityProviderService } from './identity-provider.service.js';
import { OAuthTransactionStore } from './oauth-transaction.store.js';
import { RequestSecurityService } from './request-security.service.js';

interface ValidSession {
  session: SessionDocument;
  user: UserDocument;
}

@Injectable()
export class AuthService implements AuthApplication {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(IdentityProviderService) private readonly provider: IdentityProviderService,
    @Inject(OAuthTransactionStore) private readonly transactions: OAuthTransactionStore,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(TransactionManager) private readonly transactionManager: TransactionManager,
    @Inject(RequestSecurityService) private readonly security: RequestSecurityService,
    @Inject(AuthRateLimitService) private readonly rateLimit: AuthRateLimitService,
  ) {}

  verifyInternalRequest(request: Request): Promise<void> {
    return this.security.verify(request);
  }

  async startGoogle(
    returnTo: string,
    request: Request,
  ): Promise<{
    authorizationUrl: string;
    transactionToken: string;
    expiresAt: string;
  }> {
    const ipHash = this.requestIpHash(request);
    await this.rateLimit.consume(`start:ip:${ipHash}`, 10, 600);
    if (!['/app', '/onboarding/phone', '/settings/sessions'].includes(returnTo)) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid return path', HttpStatus.BAD_REQUEST);
    }
    const state = this.crypto.randomToken();
    const nonce = this.crypto.randomToken();
    const verifier = this.crypto.randomToken(48);
    const stored = await this.transactions.create({
      stateHash: this.crypto.stateHash(state),
      nonce,
      verifier,
      redirectUri: this.config.GOOGLE_REDIRECT_URI,
      returnTo,
      createdAt: new Date().toISOString(),
    });
    const authorizationUrl = await this.provider.createAuthorizationUrl({
      state,
      nonce,
      codeChallenge: this.provider.codeChallenge(verifier),
    });
    return {
      authorizationUrl,
      transactionToken: stored.token,
      expiresAt: stored.expiresAt.toISOString(),
    };
  }

  async finishGoogle(input: {
    code?: string;
    state: string;
    transactionToken: string;
    providerError?: string;
    request: Request;
  }): Promise<SessionTokens & { session: AuthSessionView; returnTo: string }> {
    const ipHash = this.requestIpHash(input.request);
    await this.rateLimit.consume(`callback:ip:${ipHash}`, 20, 600);
    const transaction = await this.transactions.consume(input.transactionToken);
    if (!transaction) {
      throw new ApiError(
        'OAUTH_TRANSACTION_EXPIRED',
        'Sign-in transaction expired',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!this.crypto.safeEqual(transaction.stateHash, this.crypto.stateHash(input.state))) {
      throw new ApiError(
        'OAUTH_STATE_INVALID',
        'Sign-in validation failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (input.providerError) {
      throw new ApiError('OAUTH_PROVIDER_DENIED', 'Sign-in was cancelled', HttpStatus.UNAUTHORIZED);
    }
    if (!input.code) {
      throw new ApiError(
        'OAUTH_CODE_INVALID',
        'Authorization code is missing',
        HttpStatus.BAD_REQUEST,
      );
    }
    const identity = await this.provider.exchange({
      code: input.code,
      verifier: transaction.verifier,
      nonce: transaction.nonce,
      redirectUri: transaction.redirectUri,
    });
    const deviceSummary = this.deviceSummary(input.request.header('user-agent'));
    const now = new Date();
    const rawTokens = this.createRawTokens(now);

    const result = await this.transactionManager
      .run(async (session) => {
        const resolved = await this.repository.resolveIdentity(identity, session);
        await this.repository.enforceSessionLimit(
          resolved.user._id,
          this.config.AUTH_MAX_SESSIONS,
          now,
          session,
        );
        const document = this.sessionDocument(
          resolved.user._id,
          rawTokens,
          now,
          deviceSummary,
          ipHash,
        );
        await this.repository.insertSession(document, session);
        await this.repository.appendAudit(
          {
            event: 'AUTH_LOGIN_SUCCESS',
            outcome: 'SUCCESS',
            userId: resolved.user._id,
            identityId: resolved.identity._id,
            sessionId: document.sessionId,
            ipHash,
            deviceSummary,
          },
          session,
        );
        return { user: resolved.user, document };
      })
      .catch(async (error: unknown) => {
        if (error instanceof ApiError && error.code === 'ACCOUNT_LINK_REVIEW_REQUIRED') {
          await this.repository.appendAudit({
            event: 'ACCOUNT_LINK_REVIEW_REQUIRED',
            outcome: 'FAILURE',
            reasonCode: error.code,
            ipHash,
            deviceSummary,
          });
        }
        throw error;
      });

    return {
      ...rawTokens,
      session: this.sessionView(result.document, result.user),
      returnTo: transaction.returnTo,
    };
  }

  async getSession(accessToken: string): Promise<AuthSessionView> {
    const valid = await this.requireAccess(accessToken);
    return this.sessionView(valid.session, valid.user);
  }

  async getMe(accessToken: string): Promise<AuthSessionView> {
    return this.getSession(accessToken);
  }

  async refresh(
    refreshToken: string,
    request: Request,
  ): Promise<SessionTokens & { session: AuthSessionView }> {
    const ipHash = this.requestIpHash(request);
    await this.rateLimit.consume(`refresh:ip:${ipHash}`, 60, 60);
    const hashes = this.crypto.candidateTokenHashes(refreshToken);
    const current = await this.repository.findSessionByRefreshToken(hashes);
    const now = new Date();
    if (!current) {
      const previous = await this.repository.findSessionByPreviousRefreshToken(hashes);
      if (previous) {
        if (previous.previousRefreshValidUntil && previous.previousRefreshValidUntil >= now) {
          throw new ApiError(
            'SESSION_REFRESHED',
            'Session was already refreshed',
            HttpStatus.CONFLICT,
          );
        }
        await this.repository.revokeSessionById(
          previous.userId,
          previous.sessionId,
          'REFRESH_REUSE',
          now,
        );
        await this.repository.appendAudit({
          event: 'AUTH_REFRESH_REUSE',
          outcome: 'FAILURE',
          reasonCode: 'REFRESH_TOKEN_REUSED',
          userId: previous.userId,
          sessionId: previous.sessionId,
          ipHash,
        });
        throw new ApiError(
          'REFRESH_TOKEN_REUSED',
          'Session has been revoked',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw new ApiError('SESSION_REQUIRED', 'Session is required', HttpStatus.UNAUTHORIZED);
    }
    await this.rateLimit.consume(`refresh:session:${current.sessionId}`, 30, 60);
    if (current.revokedAt) {
      throw new ApiError('SESSION_REVOKED', 'Session has been revoked', HttpStatus.UNAUTHORIZED);
    }
    if (current.absoluteExpiresAt <= now) {
      await this.repository.revokeSessionById(current.userId, current.sessionId, 'EXPIRED', now);
      throw new ApiError('SESSION_EXPIRED', 'Session has expired', HttpStatus.UNAUTHORIZED);
    }
    const rawTokens = this.createRawTokens(now, current.absoluteExpiresAt);
    const updated = await this.repository.rotateSession(
      current.sessionId,
      current.refreshTokenHash,
      {
        accessTokenHash: this.crypto.hashToken(rawTokens.accessToken),
        accessTokenKeyId: this.crypto.activeAuthKeyId(),
        accessExpiresAt: new Date(rawTokens.accessExpiresAt),
        refreshTokenHash: this.crypto.hashToken(rawTokens.refreshToken),
        refreshTokenKeyId: this.crypto.activeAuthKeyId(),
        previousRefreshTokenHash: current.refreshTokenHash,
        previousRefreshValidUntil: new Date(
          now.getTime() + this.config.AUTH_REFRESH_REUSE_GRACE_SECONDS * 1000,
        ),
        lastRefreshedAt: now,
        lastSeenAt: now,
      },
      current.refreshCounter,
    );
    if (!updated) {
      throw new ApiError('SESSION_REFRESHED', 'Session was already refreshed', HttpStatus.CONFLICT);
    }
    const user = await this.repository.findUser(updated.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ApiError('SESSION_REVOKED', 'Account is not active', HttpStatus.UNAUTHORIZED);
    }
    await this.repository.appendAudit({
      event: 'AUTH_REFRESH_SUCCESS',
      outcome: 'SUCCESS',
      userId: user._id,
      sessionId: updated.sessionId,
      ipHash,
    });
    return { ...rawTokens, session: this.sessionView(updated, user) };
  }

  async logout(input: { accessToken?: string; refreshToken?: string }): Promise<void> {
    const session = input.accessToken
      ? await this.repository.findSessionByAccessToken(
          this.crypto.candidateTokenHashes(input.accessToken),
        )
      : input.refreshToken
        ? await this.repository.findSessionByRefreshToken(
            this.crypto.candidateTokenHashes(input.refreshToken),
          )
        : null;
    if (!session) return;
    await this.repository.revokeSessionById(
      session.userId,
      session.sessionId,
      'USER_LOGOUT',
      new Date(),
    );
    await this.repository.appendAudit({
      event: 'AUTH_LOGOUT',
      outcome: 'SUCCESS',
      userId: session.userId,
      sessionId: session.sessionId,
    });
  }

  async logoutAll(accessToken: string, csrfToken: string): Promise<void> {
    const valid = await this.requireAccess(accessToken);
    this.assertCsrf(valid.session, csrfToken);
    await this.rateLimit.consume(`mutation:user:${valid.user._id.toHexString()}`, 30, 60);
    await this.repository.revokeAll(valid.user._id, 'USER_LOGOUT_ALL', new Date());
    await this.repository.appendAudit({
      event: 'AUTH_LOGOUT_ALL',
      outcome: 'SUCCESS',
      userId: valid.user._id,
      sessionId: valid.session.sessionId,
    });
  }

  async listSessions(accessToken: string): Promise<DeviceSessionView[]> {
    const valid = await this.requireAccess(accessToken);
    return this.repository.listSessions(valid.user._id, valid.session.sessionId);
  }

  async revokeSession(
    accessToken: string,
    csrfToken: string,
    sessionId: string,
  ): Promise<{ revokedCurrent: boolean }> {
    const valid = await this.requireAccess(accessToken);
    this.assertCsrf(valid.session, csrfToken);
    await this.rateLimit.consume(`mutation:user:${valid.user._id.toHexString()}`, 30, 60);
    await this.repository.revokeSessionById(valid.user._id, sessionId, 'USER_REVOKED', new Date());
    await this.repository.appendAudit({
      event: 'AUTH_SESSION_REVOKED',
      outcome: 'SUCCESS',
      userId: valid.user._id,
      sessionId,
    });
    return { revokedCurrent: valid.session.sessionId === sessionId };
  }

  async updatePhone(
    accessToken: string,
    csrfToken: string,
    phone: string,
    request: Request,
  ): Promise<AuthSessionView> {
    const valid = await this.requireAccess(accessToken);
    this.assertCsrf(valid.session, csrfToken);
    const ipHash = this.requestIpHash(request);
    await Promise.all([
      this.rateLimit.consume(`phone:user:${valid.user._id.toHexString()}`, 5, 3600),
      this.rateLimit.consume(`phone:ip:${ipHash}`, 10, 3600),
    ]);
    const parsed = parsePhoneNumberFromString(phone.trim(), 'VN');
    if (!parsed?.isValid()) {
      throw new ApiError('PHONE_INVALID', 'Phone number is invalid', HttpStatus.BAD_REQUEST);
    }
    const normalized = parsed.number;
    const encrypted = this.crypto.encrypt(normalized, `user:${valid.user._id.toHexString()}:phone`);
    const updated = await this.repository.updatePhone(
      valid.user._id,
      encrypted,
      this.crypto.lookupHash(normalized),
    );
    if (!updated) {
      throw new ApiError('SESSION_REVOKED', 'Account is not active', HttpStatus.UNAUTHORIZED);
    }
    await this.repository.appendAudit({
      event: 'AUTH_PHONE_SUBMITTED',
      outcome: 'SUCCESS',
      userId: updated._id,
      sessionId: valid.session.sessionId,
    });
    return this.sessionView(valid.session, updated);
  }

  private async requireAccess(accessToken: string): Promise<ValidSession> {
    if (!accessToken) {
      throw new ApiError('SESSION_REQUIRED', 'Session is required', HttpStatus.UNAUTHORIZED);
    }
    const session = await this.repository.findSessionByAccessToken(
      this.crypto.candidateTokenHashes(accessToken),
    );
    if (!session) {
      throw new ApiError('SESSION_REQUIRED', 'Session is required', HttpStatus.UNAUTHORIZED);
    }
    const now = new Date();
    if (session.revokedAt) {
      throw new ApiError('SESSION_REVOKED', 'Session has been revoked', HttpStatus.UNAUTHORIZED);
    }
    if (session.absoluteExpiresAt <= now || session.accessExpiresAt <= now) {
      throw new ApiError(
        'SESSION_REFRESH_REQUIRED',
        'Session refresh is required',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const user = await this.repository.findUser(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ApiError('SESSION_REVOKED', 'Account is not active', HttpStatus.UNAUTHORIZED);
    }
    void this.repository.touchSession(session.sessionId, new Date(now.getTime() - 5 * 60_000), now);
    return { session, user };
  }

  private assertCsrf(session: SessionDocument, token: string): void {
    const expected = this.crypto.csrfToken(session.sessionId, session.refreshCounter);
    if (!token || !this.crypto.safeEqual(expected, token)) {
      throw new ApiError('CSRF_INVALID', 'CSRF validation failed', HttpStatus.FORBIDDEN);
    }
  }

  private createRawTokens(now: Date, absoluteExpiry?: Date): SessionTokens {
    const accessExpiresAt = new Date(now.getTime() + this.config.AUTH_ACCESS_TTL_SECONDS * 1000);
    const refreshExpiresAt =
      absoluteExpiry ??
      new Date(now.getTime() + this.config.AUTH_REFRESH_ABSOLUTE_TTL_SECONDS * 1000);
    return {
      accessToken: this.crypto.randomToken(),
      refreshToken: this.crypto.randomToken(),
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private sessionDocument(
    userId: Types.ObjectId,
    tokens: SessionTokens,
    now: Date,
    deviceSummary: DeviceSummary,
    ipHash: string,
  ): SessionDocument {
    const absoluteExpiresAt = new Date(tokens.refreshExpiresAt);
    return {
      _id: new Types.ObjectId(),
      sessionId: randomUUID(),
      userId,
      accessTokenHash: this.crypto.hashToken(tokens.accessToken),
      accessTokenKeyId: this.crypto.activeAuthKeyId(),
      accessExpiresAt: new Date(tokens.accessExpiresAt),
      refreshTokenHash: this.crypto.hashToken(tokens.refreshToken),
      refreshTokenKeyId: this.crypto.activeAuthKeyId(),
      refreshCounter: 0,
      absoluteExpiresAt,
      createdAt: now,
      lastSeenAt: now,
      lastRefreshedAt: now,
      deviceSummary,
      ipHash,
      purgeAt: new Date(absoluteExpiresAt.getTime() + 90 * 24 * 60 * 60_000),
    };
  }

  private sessionView(session: SessionDocument, user: UserDocument): AuthSessionView {
    const nextAction: OnboardingNextAction =
      user.phoneStatus === 'NONE'
        ? 'PHONE_REQUIRED'
        : user.phoneStatus === 'UNVERIFIED' && this.config.REQUIRE_PHONE_OTP
          ? 'PHONE_VERIFICATION_REQUIRED'
          : 'NONE';
    let maskedPhone: string | null = null;
    if (user.phone) {
      const phone = this.crypto.decrypt(user.phone, `user:${user._id.toHexString()}:phone`);
      maskedPhone = `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
    }
    return {
      authenticated: true,
      csrfToken: this.crypto.csrfToken(session.sessionId, session.refreshCounter),
      user: {
        id: user._id.toHexString(),
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        phoneStatus: user.phoneStatus,
        maskedPhone,
      },
      session: {
        id: session.sessionId,
        current: true,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        accessExpiresAt: session.accessExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
        device: session.deviceSummary,
      },
      onboarding: { nextAction },
    };
  }

  private requestIpHash(request: Request): string {
    return this.crypto.ipHash(request.ip || request.socket.remoteAddress || 'unknown');
  }

  private deviceSummary(userAgent: string | undefined): DeviceSummary {
    const ua = (userAgent ?? '').slice(0, 500);
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Unknown';
    const operatingSystem = /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Mac OS/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown';
    const deviceType: DeviceSummary['deviceType'] = /iPad|Tablet/.test(ua)
      ? 'TABLET'
      : /Mobile|Android|iPhone/.test(ua)
        ? 'MOBILE'
        : ua
          ? 'DESKTOP'
          : 'UNKNOWN';
    return { browser, operatingSystem, deviceType };
  }
}
