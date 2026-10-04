import { TransactionManager } from '../database/transaction-manager.js';
import { protectLastAdmin, serializeAuthorization } from '../authorization/role.repository.js';
import { Inject, Injectable } from '@nestjs/common';
import type { DeviceSessionView } from '@dike/contracts';
import { Types, type ClientSession, type Collection, type Connection } from 'mongoose';

import { ApiError } from '../common/api-error.js';
import { MONGO_CONNECTION } from '../common/tokens.js';
import { CryptoService } from './crypto.service.js';
import type {
  AuthIdentityDocument,
  SessionDocument,
  SessionRevokeReason,
  UserDocument,
  VerifiedIdentity,
} from './auth.types.js';

interface AuditDocument {
  event: string;
  outcome: 'SUCCESS' | 'FAILURE';
  reasonCode?: string;
  userId?: Types.ObjectId;
  identityId?: Types.ObjectId;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  deviceSummary?: SessionDocument['deviceSummary'];
  createdAt: Date;
}

@Injectable()
export class AuthRepository {
  private readonly users: Collection<UserDocument>;
  private readonly identities: Collection<AuthIdentityDocument>;
  private readonly sessions: Collection<SessionDocument>;
  private readonly audit: Collection<AuditDocument>;

  constructor(
    @Inject(MONGO_CONNECTION) private readonly connection: Connection,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {
    this.users = connection.collection<UserDocument>('users');
    this.identities = connection.collection<AuthIdentityDocument>('auth_identities');
    this.sessions = connection.collection<SessionDocument>('sessions');
    this.audit = connection.collection<AuditDocument>('audit_logs');
  }

  async resolveIdentity(
    identity: VerifiedIdentity,
    session: ClientSession,
  ): Promise<{ user: UserDocument; identity: AuthIdentityDocument }> {
    const now = new Date();
    const normalizedEmail = identity.email.trim().toLowerCase();
    const emailLookupHash = this.crypto.lookupHash(normalizedEmail);
    const existing = await this.identities.findOne(
      { provider: 'GOOGLE', providerSubject: identity.subject },
      { session },
    );

    if (existing) {
      const email = this.crypto.encrypt(
        normalizedEmail,
        `authIdentity:${existing._id.toHexString()}:email`,
      );
      await this.identities.updateOne(
        { _id: existing._id },
        {
          $set: {
            email,
            emailLookupHash,
            emailVerified: true,
            providerDisplayName: identity.displayName,
            providerAvatarUrl: identity.avatarUrl,
            lastLoginAt: now,
            updatedAt: now,
          },
        },
        { session },
      );
      await this.users.updateOne(
        { _id: existing.userId, status: 'ACTIVE' },
        {
          $set: {
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            updatedAt: now,
          },
        },
        { session },
      );
      const user = await this.users.findOne({ _id: existing.userId }, { session });
      if (!user || user.status !== 'ACTIVE') {
        throw new ApiError('SESSION_REVOKED', 'Account is not active', 401);
      }
      return {
        user,
        identity: {
          ...existing,
          email,
          emailLookupHash,
          providerDisplayName: identity.displayName,
          providerAvatarUrl: identity.avatarUrl,
          lastLoginAt: now,
          updatedAt: now,
        },
      };
    }

    const conflicting = await this.identities.findOne({ emailLookupHash }, { session });
    if (conflicting) {
      throw new ApiError('ACCOUNT_LINK_REVIEW_REQUIRED', 'Unable to complete sign in', 409);
    }

    const userId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const user: UserDocument = {
      _id: userId,
      status: 'ACTIVE',
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      phoneStatus: 'NONE',
      roles: ['MEMBER'],
      roleVersion: 0,
      phoneVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    const identityDocument: AuthIdentityDocument = {
      _id: identityId,
      provider: 'GOOGLE',
      providerSubject: identity.subject,
      userId,
      email: this.crypto.encrypt(normalizedEmail, `authIdentity:${identityId.toHexString()}:email`),
      emailLookupHash,
      emailVerified: true,
      providerDisplayName: identity.displayName,
      providerAvatarUrl: identity.avatarUrl,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.users.insertOne(user, { session });
    await this.identities.insertOne(identityDocument, { session });
    return { user, identity: identityDocument };
  }

  async insertSession(document: SessionDocument, session: ClientSession): Promise<void> {
    await this.sessions.insertOne(document, { session });
  }

  async enforceSessionLimit(
    userId: Types.ObjectId,
    maximum: number,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const active = await this.sessions
      .find({ userId, revokedAt: { $exists: false }, absoluteExpiresAt: { $gt: now } }, { session })
      .sort({ lastSeenAt: 1 })
      .toArray();
    const overflow = active.length - maximum + 1;
    if (overflow <= 0) return;
    await this.sessions.updateMany(
      { _id: { $in: active.slice(0, overflow).map((item) => item._id) } },
      { $set: { revokedAt: now, revokedReason: 'SESSION_LIMIT' satisfies SessionRevokeReason } },
      { session },
    );
  }

  async findSessionByAccessToken(hashes: string[]): Promise<SessionDocument | null> {
    return this.sessions.findOne({ accessTokenHash: { $in: hashes } });
  }

  async findSessionByRefreshToken(hashes: string[]): Promise<SessionDocument | null> {
    return this.sessions.findOne({ refreshTokenHash: { $in: hashes } });
  }

  async findSessionByPreviousRefreshToken(hashes: string[]): Promise<SessionDocument | null> {
    return this.sessions.findOne({ previousRefreshTokenHash: { $in: hashes } });
  }

  async findUser(userId: Types.ObjectId): Promise<UserDocument | null> {
    return this.users.findOne({ _id: userId });
  }

  async touchSession(sessionId: string, before: Date, now: Date): Promise<void> {
    await this.sessions.updateOne(
      { sessionId, lastSeenAt: { $lte: before }, revokedAt: { $exists: false } },
      { $set: { lastSeenAt: now } },
    );
  }

  async rotateSession(
    sessionId: string,
    expectedRefreshHash: string,
    update: Pick<
      SessionDocument,
      | 'accessTokenHash'
      | 'accessTokenKeyId'
      | 'accessExpiresAt'
      | 'refreshTokenHash'
      | 'refreshTokenKeyId'
      | 'previousRefreshTokenHash'
      | 'previousRefreshValidUntil'
      | 'lastRefreshedAt'
      | 'lastSeenAt'
    >,
    expectedCounter: number,
  ): Promise<SessionDocument | null> {
    return this.sessions.findOneAndUpdate(
      {
        sessionId,
        refreshTokenHash: expectedRefreshHash,
        refreshCounter: expectedCounter,
        revokedAt: { $exists: false },
      },
      { $set: update, $inc: { refreshCounter: 1 } },
      { returnDocument: 'after' },
    );
  }

  async revokeSessionById(
    userId: Types.ObjectId,
    sessionId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    const result = await this.sessions.updateOne(
      { userId, sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokedReason: reason } },
    );
    return result.modifiedCount > 0;
  }

  async revokeAll(userId: Types.ObjectId, reason: SessionRevokeReason, now: Date): Promise<void> {
    await this.sessions.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokedReason: reason } },
    );
  }

  async listSessions(userId: Types.ObjectId, currentId: string): Promise<DeviceSessionView[]> {
    const now = new Date();
    const sessions = await this.sessions
      .find({ userId, revokedAt: { $exists: false }, absoluteExpiresAt: { $gt: now } })
      .sort({ lastSeenAt: -1 })
      .toArray();
    return sessions.map((item) => ({
      id: item.sessionId,
      current: item.sessionId === currentId,
      device: item.deviceSummary,
      createdAt: item.createdAt.toISOString(),
      lastSeenAt: item.lastSeenAt.toISOString(),
      absoluteExpiresAt: item.absoluteExpiresAt.toISOString(),
    }));
  }

  async updatePhone(
    userId: Types.ObjectId,
    encrypted: NonNullable<UserDocument['phone']>,
    lookupHash: string,
  ): Promise<UserDocument | null> {
    return new TransactionManager(this.connection).run(async (session) => {
      await serializeAuthorization(this.connection, session);
      const current = await this.users.findOne({ _id: userId, status: 'ACTIVE' }, { session });
      if (!current) throw new ApiError('SESSION_REVOKED', 'Account is not active', 401);
      if (current.phoneLookupHash === lookupHash) return current;
      await protectLastAdmin(this.connection, current, session);
      const now = new Date();
      const updated = await this.users.findOneAndUpdate(
        { _id: userId, phoneVersion: current.phoneVersion },
        {
          $set: {
            phone: encrypted,
            phoneLookupHash: lookupHash,
            phoneStatus: 'UNVERIFIED',
            phoneUpdatedAt: now,
            updatedAt: now,
          },
          $unset: { phoneVerifiedAt: '', activePhoneChallengeId: '' },
          $pull: { roles: 'VERIFIED_MEMBER' },
          $inc: { phoneVersion: 1, roleVersion: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw new ApiError('PHONE_CHANGED', 'Phone changed', 409);
      await this.appendAudit({ event: 'AUTH_PHONE_CHANGED', outcome: 'SUCCESS', userId }, session);
      return updated;
    });
  }

  async appendAudit(
    document: Omit<AuditDocument, 'createdAt'>,
    session?: ClientSession,
  ): Promise<void> {
    await this.audit.insertOne({ ...document, createdAt: new Date() }, session ? { session } : {});
  }
}
