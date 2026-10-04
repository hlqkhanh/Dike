import type {
  AuthSessionView,
  AccountRole,
  DeviceSessionView,
  DeviceSummary,
  PhoneStatus,
} from '@dike/contracts';
import type { Request } from 'express';
import type { Types } from 'mongoose';

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface UserDocument {
  _id: Types.ObjectId;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  displayName: string;
  avatarUrl: string | null;
  phone?: EncryptedValue;
  phoneLookupHash?: string;
  phoneStatus: PhoneStatus;
  phoneUpdatedAt?: Date;
  roles: AccountRole[];
  roleVersion: number;
  phoneVersion: number;
  phoneVerifiedAt?: Date;
  activePhoneChallengeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthIdentityDocument {
  _id: Types.ObjectId;
  provider: 'GOOGLE';
  providerSubject: string;
  userId: Types.ObjectId;
  email: EncryptedValue;
  emailLookupHash: string;
  emailVerified: boolean;
  providerDisplayName: string;
  providerAvatarUrl: string | null;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionRevokeReason =
  | 'USER_LOGOUT'
  | 'USER_LOGOUT_ALL'
  | 'USER_REVOKED'
  | 'REFRESH_REUSE'
  | 'SESSION_LIMIT'
  | 'EXPIRED';

export interface SessionDocument {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  accessTokenHash: string;
  accessTokenKeyId: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshTokenKeyId: string;
  previousRefreshTokenHash?: string;
  previousRefreshValidUntil?: Date;
  refreshCounter: number;
  absoluteExpiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  lastRefreshedAt: Date;
  revokedAt?: Date;
  revokedReason?: SessionRevokeReason;
  deviceSummary: DeviceSummary;
  ipHash: string;
  purgeAt: Date;
}

export interface VerifiedIdentity {
  subject: string;
  email: string;
  emailVerified: true;
  displayName: string;
  avatarUrl: string | null;
}

export interface OAuthTransaction {
  stateHash: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface AuthApplication {
  verifyInternalRequest(request: Request): Promise<void>;
  startGoogle(
    returnTo: string,
    request: Request,
  ): Promise<{
    authorizationUrl: string;
    transactionToken: string;
    expiresAt: string;
  }>;
  finishGoogle(input: {
    code?: string;
    state: string;
    transactionToken: string;
    providerError?: string;
    request: Request;
  }): Promise<SessionTokens & { session: AuthSessionView; returnTo: string }>;
  getSession(accessToken: string): Promise<AuthSessionView>;
  refresh(
    refreshToken: string,
    request: Request,
  ): Promise<SessionTokens & { session: AuthSessionView }>;
  logout(input: { accessToken?: string; refreshToken?: string }): Promise<void>;
  logoutAll(accessToken: string, csrfToken: string): Promise<void>;
  listSessions(accessToken: string): Promise<DeviceSessionView[]>;
  revokeSession(
    accessToken: string,
    csrfToken: string,
    sessionId: string,
  ): Promise<{ revokedCurrent: boolean }>;
  updatePhone(
    accessToken: string,
    csrfToken: string,
    phone: string,
    request: Request,
  ): Promise<AuthSessionView>;
  getMe(accessToken: string): Promise<AuthSessionView>;
}
