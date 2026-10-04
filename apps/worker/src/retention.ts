import { randomUUID } from 'node:crypto';
import type { FileRecord } from '@dike/contracts';
import type { StoragePort } from '@dike/storage';
import type { Connection, Types } from 'mongoose';

export class RetentionService {
  constructor(
    private readonly mongo: Connection,
    private readonly storage: StoragePort,
  ) {}
  async sweep(now = new Date()): Promise<void> {
    await this.purgeAccounts(now);
    const files = this.mongo.collection<
      FileRecord<Types.ObjectId> & { quarantineCleaned?: boolean }
    >('files');
    await files.updateMany(
      {
        $or: [
          { status: 'PENDING', expiresAt: { $lte: now } },
          { status: 'PROCESSING', lockedUntil: { $lte: now } },
          { status: 'READY', expiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: 'DELETE_PENDING', deleteAfter: new Date(now.getTime() + 900000) },
        $unset: { lockToken: '', lockedUntil: '' },
      },
    );
    const quarantine = await files
      .find({
        status: 'READY',
        quarantineCleaned: { $ne: true },
        uploadExpiresAt: { $lte: new Date(now.getTime() - 60000) },
      })
      .limit(50)
      .toArray();
    for (const file of quarantine) {
      await this.storage.remove(file.uploadKey, false);
      await files.updateOne(
        { _id: file._id, status: 'READY' },
        { $set: { quarantineCleaned: true } },
      );
    }
    for (let i = 0; i < 50; i++) {
      const token = randomUUID();
      const file = await files.findOneAndUpdate(
        {
          status: 'DELETE_PENDING',
          deleteAfter: { $lte: now },
          uploadExpiresAt: { $lte: now },
          $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockToken: token, lockedUntil: new Date(now.getTime() + 120000) } },
        { returnDocument: 'after' },
      );
      if (!file) break;
      // Repeated deletion is safe. Do not discard metadata if either object removal fails.
      await this.storage.remove(file.uploadKey, false);
      await this.storage.remove(file.finalKey, file.purpose === 'AVATAR');
      const session = await this.mongo.startSession();
      try {
        await session.withTransaction(async () => {
          await this.mongo
            .collection('users')
            .updateOne(
              { _id: file.ownerId, avatarFileId: file._id },
              { $set: { avatarUrl: null, profileEdited: true }, $unset: { avatarFileId: '' } },
              { session },
            );
          await files.updateOne(
            { _id: file._id, status: 'DELETE_PENDING', lockToken: token },
            { $set: { status: 'DELETED' }, $unset: { lockToken: '', lockedUntil: '' } },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
    }
    const tombstones = await this.mongo
      .collection('users')
      .find({ status: 'DELETED', purgeAt: { $lte: now } })
      .limit(50)
      .toArray();
    for (const user of tombstones) {
      if (await files.countDocuments({ ownerId: user._id, status: { $ne: 'DELETED' } })) continue;
      const session = await this.mongo.startSession();
      try {
        await session.withTransaction(async () => {
          await files.deleteMany({ ownerId: user._id, status: 'DELETED' }, { session });
          await this.mongo.collection('audit_logs').deleteMany({ userId: user._id }, { session });
          await this.mongo
            .collection('users')
            .deleteOne({ _id: user._id, status: 'DELETED', purgeAt: { $lte: now } }, { session });
        });
      } finally {
        await session.endSession();
      }
    }
  }
  private async purgeAccounts(now: Date) {
    const pending = await this.mongo
      .collection('users')
      .find({ status: 'DELETION_PENDING', deletionDueAt: { $lte: now } })
      .limit(20)
      .toArray();
    for (const user of pending) {
      const session = await this.mongo.startSession();
      try {
        await session.withTransaction(async () => {
          const result = await this.mongo.collection('users').replaceOne(
            { _id: user._id, status: 'DELETION_PENDING', deletionDueAt: { $lte: now } },
            {
              _id: user._id,
              status: 'DELETED',
              displayName: 'Deleted account',
              avatarUrl: null,
              phoneStatus: 'NONE',
              roles: [],
              createdAt: now,
              updatedAt: now,
              purgeAt: new Date(now.getTime() + 90 * 86400000),
            },
            { session },
          );
          if (!result.modifiedCount) return;
          for (const name of ['auth_identities', 'sessions', 'consents', 'phone_verifications'])
            await this.mongo.collection(name).deleteMany({ userId: user._id }, { session });
          await this.mongo
            .collection('audit_logs')
            .updateMany(
              { userId: user._id },
              { $unset: { ipHash: '', deviceSummary: '', identityId: '', sessionId: '' } },
              { session },
            );
          await this.mongo
            .collection('files')
            .updateMany(
              { ownerId: user._id, status: { $ne: 'DELETED' } },
              { $set: { status: 'DELETE_PENDING', deleteAfter: new Date(now.getTime() + 900000) } },
              { session },
            );
          await this.mongo.collection('audit_logs').insertOne(
            {
              event: 'ACCOUNT_DATA_PURGED',
              outcome: 'SUCCESS',
              userId: user._id,
              createdAt: now,
            },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
    }
  }
}
