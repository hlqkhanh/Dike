import { Inject, Injectable } from '@nestjs/common';
import { POLICY_VERSION, type ConsentView, type FileRecord } from '@dike/contracts';
import { Types, type Connection, type ClientSession } from 'mongoose';
import type { UserDocument } from '../auth/auth.types.js';
import { API_CONFIG, MONGO_CONNECTION } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import { ApiError } from '../common/api-error.js';
import { TransactionManager } from '../database/transaction-manager.js';
import { protectLastAdmin, serializeAuthorization } from '../authorization/role.repository.js';
import {
  privacyOf,
  canReadProfile,
  projectProfile,
  literalNameQuery,
  validConsent,
} from './profile.policy.js';
import type { ConsentDto, PrivacyDto, UpdateProfileDto } from './users.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(MONGO_CONNECTION) private readonly connection: Connection,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private async active(id: Types.ObjectId, session?: ClientSession) {
    const user = await this.connection
      .collection<UserDocument>('users')
      .findOne({ _id: id, status: 'ACTIVE' }, session ? { session } : {});
    if (!user) throw new ApiError('PROFILE_NOT_FOUND', 'Profile unavailable', 404);
    return user;
  }
  async profile(id: Types.ObjectId) {
    return projectProfile(await this.active(id));
  }
  async privacy(id: Types.ObjectId) {
    return privacyOf(await this.active(id));
  }
  async visible(viewerId: Types.ObjectId, targetId: Types.ObjectId) {
    const user = await this.active(targetId);
    if (!canReadProfile(viewerId.toHexString(), user))
      throw new ApiError('PROFILE_NOT_FOUND', 'Profile unavailable', 404);
    return projectProfile(user);
  }
  async search(query: string) {
    const literal = literalNameQuery(query);
    if (!literal) return [];
    const users = await this.connection
      .collection<UserDocument>('users')
      .find({
        status: 'ACTIVE',
        'privacy.discoverable': true,
        'privacy.profileVisibility': 'MEMBERS',
        displayName: { $regex: literal, $options: 'i' },
      })
      .sort({ _id: 1 })
      .limit(20)
      .maxTimeMS(2000)
      .toArray();
    return users.map(projectProfile);
  }
  async publicVehicles(viewerId: Types.ObjectId, targetId: Types.ObjectId) {
    await this.visible(viewerId, targetId);
    const vehicles = await this.connection
      .collection('vehicles')
      .find({ userId: targetId, status: 'APPROVED' })
      .limit(10)
      .toArray();
    return vehicles.map((vehicle) => ({
      id: String(vehicle._id),
      type: vehicle.type as string,
      model: vehicle.model as string,
      color: vehicle.color as string,
      passengerCapacity: vehicle.passengerCapacity as number,
    }));
  }
  private async mutate(id: Types.ObjectId, fields: Partial<UserDocument>, event: string) {
    return new TransactionManager(this.connection).run(async (session) => {
      const user = await this.connection
        .collection<UserDocument>('users')
        .findOneAndUpdate(
          { _id: id, status: 'ACTIVE' },
          { $set: { ...fields, updatedAt: new Date() }, $inc: { profileVersion: 1 } },
          { session, returnDocument: 'after' },
        );
      if (!user) throw new ApiError('PROFILE_NOT_FOUND', 'Profile unavailable', 404);
      await this.connection
        .collection('audit_logs')
        .insertOne({ event, outcome: 'SUCCESS', userId: id, createdAt: new Date() }, { session });
      return user;
    });
  }
  async updateProfile(id: Types.ObjectId, input: UpdateProfileDto) {
    const displayName = input.displayName.trim().normalize('NFC');
    if (displayName.length < 2)
      throw new ApiError('PROFILE_INVALID', 'Display name is too short', 400);
    return projectProfile(
      await this.mutate(
        id,
        { displayName, bio: input.bio.trim().normalize('NFC'), profileEdited: true },
        'PROFILE_UPDATED',
      ),
    );
  }
  async updatePrivacy(id: Types.ObjectId, input: PrivacyDto) {
    const privacy = {
      ...input,
      discoverable: input.profileVisibility === 'MEMBERS' && input.discoverable,
    };
    return privacyOf(await this.mutate(id, { privacy }, 'PRIVACY_UPDATED'));
  }
  async consents(id: Types.ObjectId): Promise<ConsentView> {
    await this.active(id);
    const consent = await this.connection
      .collection<ConsentView & { userId: Types.ObjectId; createdAt: Date }>('consents')
      .findOne({ userId: id, policyVersion: POLICY_VERSION }, { sort: { createdAt: -1, _id: -1 } });
    return {
      policyVersion: POLICY_VERSION,
      termsAccepted: consent?.termsAccepted ?? false,
      privacyAccepted: consent?.privacyAccepted ?? false,
      analytics: consent?.analytics ?? false,
    };
  }
  async updateConsents(id: Types.ObjectId, input: ConsentDto): Promise<ConsentView> {
    if (!validConsent(input.policyVersion, input.termsAccepted, input.privacyAccepted))
      throw new ApiError(
        'CONSENT_REQUIRED',
        'Accept the current terms and privacy notice, or request account deletion',
        400,
      );
    return new TransactionManager(this.connection).run(async (session) => {
      const updated = await this.connection
        .collection<UserDocument>('users')
        .updateOne(
          { _id: id, status: 'ACTIVE' },
          { $inc: { profileVersion: 1 }, $set: { updatedAt: new Date() } },
          { session },
        );
      if (!updated.matchedCount)
        throw new ApiError('PROFILE_NOT_FOUND', 'Profile unavailable', 404);
      await this.connection
        .collection('consents')
        .insertOne({ userId: id, ...input, createdAt: new Date() }, { session });
      await this.connection.collection('audit_logs').insertOne(
        {
          event: 'CONSENT_RECORDED',
          outcome: 'SUCCESS',
          userId: id,
          policyVersion: input.policyVersion,
          createdAt: new Date(),
        },
        { session },
      );
      return { ...input };
    });
  }
  async requestDeletion(id: Types.ObjectId) {
    if (
      ['production', 'staging'].includes(this.config.APP_ENV) &&
      !this.config.RETENTION_POLICY_APPROVED
    )
      throw new ApiError(
        'RETENTION_NOT_APPROVED',
        'Account deletion is not enabled for this environment',
        503,
      );
    return new TransactionManager(this.connection).run(async (session) => {
      await serializeAuthorization(this.connection, session);
      const user = await this.active(id, session);
      await protectLastAdmin(this.connection, user, session);
      const now = new Date();
      const due = new Date(now.getTime() + 7 * 86400000);
      await this.connection.collection<UserDocument>('users').updateOne(
        { _id: id },
        {
          $set: {
            status: 'DELETION_PENDING',
            deletionRequestedAt: now,
            deletionDueAt: due,
            updatedAt: now,
            avatarUrl: null,
          },
          $inc: { roleVersion: 1, profileVersion: 1 },
        },
        { session },
      );
      await this.connection
        .collection('sessions')
        .updateMany(
          { userId: id },
          { $set: { revokedAt: now, revokedReason: 'ACCOUNT_DELETION' } },
          { session },
        );
      // Remove publicly reachable avatars promptly; private evidence follows the purge delay.
      await this.connection
        .collection<FileRecord<Types.ObjectId>>('files')
        .updateMany(
          { ownerId: id, purpose: 'AVATAR', status: { $ne: 'DELETED' } },
          { $set: { status: 'DELETE_PENDING', deleteAfter: new Date(now.getTime() + 15 * 60000) } },
          { session },
        );
      await this.connection
        .collection('audit_logs')
        .insertOne(
          { event: 'ACCOUNT_DELETION_REQUESTED', outcome: 'SUCCESS', userId: id, createdAt: now },
          { session },
        );
      return { status: 'DELETION_PENDING' as const, purgeAfter: due.toISOString() };
    });
  }
}
