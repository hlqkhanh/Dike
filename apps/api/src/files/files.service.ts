import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { POLICY_VERSION, type FileRecord, type FileView } from '@dike/contracts';
import { InvalidImageError, sanitizeImage, validateUpload, type StoragePort } from '@dike/storage';
import { Types, type Connection } from 'mongoose';
import type { UserDocument } from '../auth/auth.types.js';
import { API_CONFIG, MONGO_CONNECTION } from '../common/tokens.js';
import { ApiError } from '../common/api-error.js';
import type { ApiConfig } from '../config/api-config.js';
import { TransactionManager } from '../database/transaction-manager.js';
import { FILE_STORAGE } from './storage.module.js';
import type { CreateUploadDto } from './files.dto.js';

@Injectable()
export class FilesService {
  constructor(
    @Inject(MONGO_CONNECTION) private readonly connection: Connection,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(FILE_STORAGE) private readonly storage: StoragePort,
  ) {}
  private get files() {
    return this.connection.collection<FileRecord<Types.ObjectId>>('files');
  }
  private notFound() {
    return new ApiError('FILE_NOT_FOUND', 'File unavailable', 404);
  }
  private view(file: FileRecord<Types.ObjectId>): FileView {
    return {
      id: file._id.toHexString(),
      purpose: file.purpose,
      status: file.status,
      createdAt: file.createdAt.toISOString(),
      expiresAt: file.expiresAt.toISOString(),
      publicUrl:
        file.purpose === 'AVATAR' && file.status === 'READY'
          ? this.storage.publicUrl(file.finalKey)
          : null,
    };
  }
  async list(ownerId: Types.ObjectId) {
    return (
      await this.files
        .find({
          ownerId,
          status: { $in: ['PENDING', 'PROCESSING', 'READY'] },
          expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()
    ).map((file) => this.view(file));
  }
  async create(ownerId: Types.ObjectId, input: CreateUploadDto) {
    if (
      input.purpose === 'VERIFICATION_SANDBOX' &&
      !['local', 'test'].includes(this.config.APP_ENV)
    )
      throw new ApiError(
        'FILE_PURPOSE_DISABLED',
        'Verification document collection is not enabled',
        403,
      );
    try {
      validateUpload(input.contentType, input.size);
    } catch {
      throw new ApiError('FILE_INVALID', 'Unsupported image type or size', 400);
    }
    const now = new Date();
    const id = new Types.ObjectId();
    const file: FileRecord<Types.ObjectId> = {
      _id: id,
      ownerId,
      purpose: input.purpose,
      status: 'PENDING',
      uploadKey: `uploads/${randomUUID()}`,
      finalKey: `${input.purpose === 'AVATAR' ? 'avatars' : 'verification'}/${randomUUID()}.jpg`,
      contentType: input.contentType,
      size: input.size,
      createdAt: now,
      uploadExpiresAt: new Date(now.getTime() + 300000),
      expiresAt: new Date(now.getTime() + 900000),
    };
    await new TransactionManager(this.connection).run(async (session) => {
      const user = await this.connection
        .collection<UserDocument>('users')
        .updateOne(
          { _id: ownerId, status: 'ACTIVE' },
          { $inc: { profileVersion: 1 } },
          { session },
        );
      if (!user.matchedCount) throw this.notFound();
      const consent = await this.connection.collection('consents').findOne(
        {
          userId: ownerId,
          policyVersion: POLICY_VERSION,
          termsAccepted: true,
          privacyAccepted: true,
        },
        { session },
      );
      if (!consent)
        throw new ApiError(
          'CONSENT_REQUIRED',
          'Accept the current terms and privacy notice before uploading',
          400,
        );
      if (
        (await this.files.countDocuments(
          { ownerId, status: { $in: ['PENDING', 'PROCESSING', 'READY'] } },
          { session },
        )) >= 20
      )
        throw new ApiError('FILE_QUOTA_EXCEEDED', 'Remove unused files before uploading', 429);
      await this.files.insertOne(file, { session });
      return true;
    });
    try {
      return {
        fileId: id.toHexString(),
        uploadUrl: await this.storage.presignUpload(file.uploadKey, input.contentType, input.size),
        contentType: input.contentType,
        size: input.size,
        expiresAt: file.uploadExpiresAt.toISOString(),
      };
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE', 'File storage is temporarily unavailable', 503);
    }
  }
  async complete(ownerId: Types.ObjectId, fileId: Types.ObjectId) {
    const now = new Date();
    const token = randomUUID();
    const current = await this.files.findOne({ _id: fileId, ownerId });
    if (!current) throw this.notFound();
    if (current.status === 'READY' && current.expiresAt > now) return this.view(current);
    const claimed = await this.files.findOneAndUpdate(
      { _id: fileId, ownerId, status: 'PENDING', expiresAt: { $gt: now } },
      {
        $set: {
          status: 'PROCESSING',
          lockToken: token,
          lockedUntil: new Date(now.getTime() + 120000),
        },
      },
      { returnDocument: 'after' },
    );
    if (!claimed) throw new ApiError('FILE_NOT_READY', 'Upload is expired or processing', 409);
    try {
      const bytes = await this.storage.readUpload(
        claimed.uploadKey,
        claimed.contentType,
        claimed.size,
      );
      const image = await sanitizeImage(bytes, claimed.contentType, claimed.purpose === 'AVATAR');
      await this.storage.put(claimed.finalKey, image, claimed.purpose === 'AVATAR');
      return await new TransactionManager(this.connection).run(async (session) => {
        const user = await this.connection
          .collection<UserDocument>('users')
          .findOneAndUpdate(
            { _id: ownerId, status: 'ACTIVE' },
            { $inc: { profileVersion: 1 }, $set: { updatedAt: new Date() } },
            { session, returnDocument: 'after' },
          );
        if (!user) throw this.notFound();
        const expiresAt = new Date(
          Date.now() + (claimed.purpose === 'AVATAR' ? 3650 : 30) * 86400000,
        );
        const finalized = await this.files.findOneAndUpdate(
          {
            _id: fileId,
            ownerId,
            status: 'PROCESSING',
            lockToken: token,
            lockedUntil: { $gt: new Date() },
          },
          {
            $set: { status: 'READY', expiresAt, finalizedAt: new Date() },
            $unset: { lockToken: '', lockedUntil: '' },
          },
          { session, returnDocument: 'after' },
        );
        if (!finalized)
          throw new ApiError('FILE_NOT_READY', 'Upload changed while processing', 409);
        if (claimed.purpose === 'AVATAR') {
          if (user.avatarFileId)
            await this.files.updateOne(
              { _id: user.avatarFileId, ownerId, status: 'READY' },
              { $set: { status: 'DELETE_PENDING', deleteAfter: new Date(Date.now() + 900000) } },
              { session },
            );
          await this.connection.collection<UserDocument>('users').updateOne(
            { _id: ownerId },
            {
              $set: {
                avatarFileId: fileId,
                avatarUrl: this.storage.publicUrl(claimed.finalKey),
                profileEdited: true,
              },
            },
            { session },
          );
        }
        await this.connection.collection('audit_logs').insertOne(
          {
            event: 'FILE_ACCEPTED',
            outcome: 'SUCCESS',
            userId: ownerId,
            fileId,
            createdAt: new Date(),
          },
          { session },
        );
        return this.view(finalized);
      });
    } catch (error) {
      await this.files.updateOne(
        { _id: fileId, status: 'PROCESSING', lockToken: token },
        {
          $set: {
            status: 'DELETE_PENDING',
            deleteAfter: new Date(
              Math.max(Date.now() + 900000, claimed.uploadExpiresAt.getTime() + 60000),
            ),
          },
        },
      );
      if (error instanceof ApiError) throw error;
      if (error instanceof InvalidImageError)
        throw new ApiError('FILE_INVALID', 'Image type, size or content was rejected', 400);
      throw new ApiError('STORAGE_UNAVAILABLE', 'File processing failed; upload a new file', 503);
    }
  }
  async download(ownerId: Types.ObjectId, fileId: Types.ObjectId) {
    const file = await this.files.findOne({
      _id: fileId,
      ownerId,
      status: 'READY',
      expiresAt: { $gt: new Date() },
    });
    if (!file) throw this.notFound();
    await this.connection.collection('audit_logs').insertOne({
      event: 'FILE_READ_AUTHORIZED',
      outcome: 'SUCCESS',
      userId: ownerId,
      fileId,
      createdAt: new Date(),
    });
    try {
      return {
        url:
          file.purpose === 'AVATAR'
            ? this.storage.publicUrl(file.finalKey)
            : await this.storage.presignDownload(file.finalKey),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE', 'File storage is temporarily unavailable', 503);
    }
  }
  async remove(ownerId: Types.ObjectId, fileId: Types.ObjectId): Promise<void> {
    await new TransactionManager(this.connection).run(async (session) => {
      const user = await this.connection
        .collection<UserDocument>('users')
        .findOneAndUpdate(
          { _id: ownerId, status: 'ACTIVE' },
          { $inc: { profileVersion: 1 } },
          { session, returnDocument: 'after' },
        );
      if (!user) throw this.notFound();
      const file = await this.files.findOneAndUpdate(
        { _id: fileId, ownerId, status: { $ne: 'DELETED' } },
        { $set: { status: 'DELETE_PENDING', deleteAfter: new Date(Date.now() + 900000) } },
        { session, returnDocument: 'after' },
      );
      if (!file) throw this.notFound();
      if (user.avatarFileId?.equals(fileId))
        await this.connection
          .collection<UserDocument>('users')
          .updateOne(
            { _id: ownerId },
            { $set: { avatarUrl: null, profileEdited: true }, $unset: { avatarFileId: '' } },
            { session },
          );
      await this.connection.collection('audit_logs').insertOne(
        {
          event: 'FILE_DELETION_REQUESTED',
          outcome: 'SUCCESS',
          userId: ownerId,
          fileId,
          createdAt: new Date(),
        },
        { session },
      );
      return true;
    });
  }
}
