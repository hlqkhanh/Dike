import { createHash, randomUUID } from 'node:crypto';
import { stage5Migration } from './stage5-migration.js';

import type { Connection } from 'mongoose';

interface Migration {
  id: string;
  description: string;
  signature: string;
  apply(connection: Connection): Promise<void>;
}

interface MigrationLock {
  _id: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export const migrations: Migration[] = [
  {
    id: '20261002-001-foundation-indexes',
    description: 'Create outbox and idempotent job execution indexes',
    signature: 'outbox-dispatch-v1-job-execution-v1',
    async apply(connection) {
      await connection.collection('outbox_events').createIndexes([
        { key: { status: 1, availableAt: 1, lockedUntil: 1 }, name: 'outbox_dispatch' },
        { key: { eventId: 1 }, name: 'outbox_event_id_unique', unique: true },
      ]);
      await connection
        .collection('job_executions')
        .createIndex({ eventId: 1 }, { name: 'job_execution_event_unique', unique: true });
    },
  },
  {
    id: '20261003-002-auth-session-indexes',
    description: 'Create identity, user, session and audit indexes for Stage 2 authentication',
    signature: 'auth-identity-v1-user-v1-opaque-session-v1-audit-v1',
    async apply(connection) {
      await connection.collection('auth_identities').createIndexes([
        {
          key: { provider: 1, providerSubject: 1 },
          name: 'auth_identity_provider_subject_unique',
          unique: true,
        },
        { key: { emailLookupHash: 1 }, name: 'auth_identity_email_lookup' },
        { key: { userId: 1 }, name: 'auth_identity_user' },
      ]);
      await connection.collection('users').createIndexes([
        { key: { phoneLookupHash: 1 }, name: 'user_phone_lookup', sparse: true },
        { key: { status: 1, updatedAt: -1 }, name: 'user_status_updated' },
      ]);
      await connection.collection('sessions').createIndexes([
        { key: { sessionId: 1 }, name: 'session_id_unique', unique: true },
        { key: { accessTokenHash: 1 }, name: 'session_access_hash_unique', unique: true },
        { key: { refreshTokenHash: 1 }, name: 'session_refresh_hash_unique', unique: true },
        {
          key: { previousRefreshTokenHash: 1 },
          name: 'session_previous_refresh_hash',
          sparse: true,
        },
        { key: { userId: 1, revokedAt: 1, lastSeenAt: -1 }, name: 'session_user_active' },
        { key: { purgeAt: 1 }, name: 'session_purge_ttl', expireAfterSeconds: 0 },
      ]);
      await connection.collection('audit_logs').createIndexes([
        { key: { userId: 1, createdAt: -1 }, name: 'audit_user_time' },
        { key: { event: 1, createdAt: -1 }, name: 'audit_event_time' },
      ]);
    },
  },
  {
    id: '20261004-003-phone-verification-roles',
    description: 'Backfill roles and enforce unique verified phones',
    signature: 'roles-v1-phone-version-v1-verified-phone-unique-v1-authorization-revision-v1',
    async apply(connection) {
      const users = connection.collection('users');
      const duplicates = await users
        .aggregate([
          { $match: { phoneStatus: 'VERIFIED', phoneLookupHash: { $type: 'string' } } },
          { $group: { _id: '$phoneLookupHash', count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 1 },
        ])
        .toArray();
      if (duplicates.length)
        throw new Error('Verified phone conflicts require manual review before migration');
      await users.updateMany({ roles: { $exists: false } }, [
        {
          $set: {
            roles: {
              $cond: [
                { $eq: ['$phoneStatus', 'VERIFIED'] },
                ['MEMBER', 'VERIFIED_MEMBER'],
                ['MEMBER'],
              ],
            },
          },
        },
      ]);
      await users.updateMany({ roleVersion: { $exists: false } }, { $set: { roleVersion: 0 } });
      await users.updateMany({ phoneVersion: { $exists: false } }, { $set: { phoneVersion: 0 } });
      await users.createIndex(
        { phoneLookupHash: 1 },
        {
          name: 'user_verified_phone_unique',
          unique: true,
          partialFilterExpression: {
            phoneStatus: 'VERIFIED',
            phoneLookupHash: { $type: 'string' },
          },
        },
      );
      if ((await users.indexes()).some((index) => index.name === 'user_phone_lookup'))
        await users.dropIndex('user_phone_lookup');
      await connection
        .collection('phone_verifications')
        .createIndex(
          { challengeId: 1 },
          { unique: true, name: 'phone_verification_challenge_unique' },
        );
      await connection
        .collection<{ _id: string; revision: number }>('authorization_revision')
        .updateOne({ _id: 'global' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    },
  },
  {
    id: '20261004-004-profiles-files-consents',
    description: 'Profile privacy defaults, file lifecycle and consent history indexes',
    signature: 'profiles-v1-files-v1-consents-v1-retention-v1',
    async apply(connection) {
      await connection.collection('users').updateMany(
        { privacy: { $exists: false } },
        {
          $set: {
            privacy: {
              profileVisibility: 'MEMBERS',
              discoverable: false,
              directMessages: 'NONE',
            },
          },
        },
      );
      await connection
        .collection('users')
        .updateMany(
          { profileVersion: { $exists: false } },
          { $set: { profileVersion: 0, bio: '' } },
        );
      await connection.collection('users').createIndexes([
        {
          key: { status: 1, 'privacy.discoverable': 1, 'privacy.profileVisibility': 1, _id: 1 },
          name: 'profile_discovery',
        },
        { key: { status: 1, deletionDueAt: 1 }, name: 'account_deletion_due' },
      ]);
      await connection.collection('files').createIndexes([
        { key: { ownerId: 1, status: 1, createdAt: -1 }, name: 'file_owner_status' },
        { key: { status: 1, expiresAt: 1, deleteAfter: 1 }, name: 'file_cleanup' },
        { key: { uploadKey: 1 }, name: 'file_upload_key_unique', unique: true },
        { key: { finalKey: 1 }, name: 'file_final_key_unique', unique: true },
      ]);
      await connection
        .collection('consents')
        .createIndex(
          { userId: 1, policyVersion: 1, createdAt: -1 },
          { name: 'consent_user_version' },
        );
    },
  },
  stage5Migration,
];

function checksum(migration: Migration): string {
  return createHash('sha256')
    .update(`${migration.id}\n${migration.description}\n${migration.signature}`)
    .digest('hex');
}

export class MigrationRunner {
  constructor(private readonly connection: Connection) {}

  async status() {
    const applied = await this.connection.collection('_migrations').find({}).toArray();
    const byId = new Map(applied.map((item) => [String(item.id), item]));
    return migrations.map((migration) => ({
      id: migration.id,
      applied: byId.has(migration.id),
      checksumMatches:
        !byId.has(migration.id) || byId.get(migration.id)?.checksum === checksum(migration),
    }));
  }

  async up(): Promise<void> {
    const owner = randomUUID();
    const acquired = await this.acquire(owner);
    if (!acquired) throw new Error('Another migration runner currently owns the lock');
    try {
      for (const migration of migrations) {
        const existing = await this.connection
          .collection('_migrations')
          .findOne({ id: migration.id });
        const expectedChecksum = checksum(migration);
        if (existing) {
          if (existing.checksum !== expectedChecksum) {
            throw new Error(`Migration checksum mismatch: ${migration.id}`);
          }
          continue;
        }
        await migration.apply(this.connection);
        await this.connection.collection('_migrations').insertOne({
          id: migration.id,
          checksum: expectedChecksum,
          appliedAt: new Date(),
          runnerVersion: '0.1.0',
        });
      }
    } finally {
      await this.connection
        .collection<MigrationLock>('_migration_locks')
        .deleteOne({ _id: 'global', owner });
    }
  }

  private async acquire(owner: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);
    try {
      const result = await this.connection
        .collection<MigrationLock>('_migration_locks')
        .findOneAndUpdate(
          { _id: 'global', $or: [{ expiresAt: { $lte: now } }, { owner }] },
          { $set: { owner, expiresAt, acquiredAt: now } },
          { upsert: true, returnDocument: 'after' },
        );
      return result?.owner === owner;
    } catch (error) {
      if ((error as { code?: number }).code === 11_000) return false;
      throw error;
    }
  }
}
