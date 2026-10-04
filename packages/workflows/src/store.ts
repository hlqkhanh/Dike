import { createHash, randomUUID } from 'node:crypto';
import { Types, type Connection, type ClientSession } from 'mongoose';
import { POLICY_VERSION, type FileRecord } from '@dike/contracts';
import type { StoragePort } from '@dike/storage';
import {
  collections,
  demand,
  isAdmin,
  verified,
  view,
  WorkflowError,
  EKYC_EVENT,
  EKYC_DELIVERY,
  type Actor,
  type CallbackEvent,
  type Kind,
  type RecordDocument,
} from './model.js';
import { MockEkycProvider, type CallbackPayload } from './provider.js';

export interface Command {
  commandId: string;
  expectedVersion: number;
}
export interface VehicleInput {
  type: 'MOTORBIKE' | 'CAR';
  model: string;
  color: string;
  syntheticPlate: string;
  passengerCapacity: number;
}
export interface CommunityInput {
  slug: string;
  name: string;
  type: 'SCHOOL' | 'COMPANY';
  description: string;
}
export interface PageInput {
  cursor?: string;
  status?: string;
  limit?: number;
}
const day = 86400000;

/** Shared transactional domain used by the API and worker; no HTTP or UI dependencies. */
export class WorkflowStore {
  constructor(
    readonly mongo: Connection,
    private readonly storage: StoragePort,
  ) {}
  collection(kind: Kind) {
    return this.mongo.collection<RecordDocument>(collections[kind]);
  }
  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.mongo.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        const lock = await this.mongo
          .collection<{ _id: string; revision: number }>('authorization_revision')
          .updateOne({ _id: 'global' }, { $inc: { revision: 1 } }, { session });
        demand(lock.matchedCount, 'MIGRATION_REQUIRED', 503);
        result = await work(session);
      });
      return result as T;
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new WorkflowError('RESOURCE_CONFLICT', 'Resource already exists');
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async actor(id: Types.ObjectId, session?: ClientSession, admin = false) {
    const user = await this.mongo
      .collection<Actor>('users')
      .findOne({ _id: id, status: 'ACTIVE' }, session ? { session } : {});
    demand(user, 'ACCOUNT_UNAVAILABLE', 403);
    if (admin) demand(isAdmin(user), 'ROLE_REQUIRED', 403);
    if (session)
      await this.mongo
        .collection('users')
        .updateOne({ _id: id }, { $inc: { profileVersion: 1 } }, { session });
    return user;
  }
  async audit(
    session: ClientSession,
    actorId: Types.ObjectId | undefined,
    userId: Types.ObjectId,
    kind: string,
    resourceId: Types.ObjectId,
    event: string,
    reason?: string,
  ) {
    await this.mongo.collection('audit_logs').insertOne(
      {
        event,
        outcome: 'SUCCESS',
        actorId,
        userId,
        resourceType: kind,
        resourceId,
        reason,
        createdAt: new Date(),
      },
      { session },
    );
  }
  async event(
    session: ClientSession,
    type: string,
    id: Types.ObjectId,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID();
    await this.mongo.collection('outbox_events').insertOne(
      {
        eventId,
        type,
        aggregateType: 'verification',
        aggregateId: String(id),
        payload,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        createdAt: new Date(),
      },
      { session },
    );
    return eventId;
  }
  async command<T>(
    actorId: Types.ObjectId,
    commandId: string,
    operation: string,
    input: unknown,
    admin: boolean,
    work: (session: ClientSession, actor: Actor) => Promise<T>,
  ): Promise<T> {
    demand(/^[0-9a-f-]{36}$/i.test(commandId), 'COMMAND_ID_REQUIRED', 400);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.transaction(async (session) => {
      const actor = await this.actor(actorId, session, admin);
      const commands = this.mongo.collection<{
        _id: Types.ObjectId;
        actorId: Types.ObjectId;
        commandId: string;
        operation: string;
        hash: string;
        result: T;
        purgeAt: Date;
      }>('workflow_commands');
      const previous = await commands.findOne({ actorId, commandId }, { session });
      if (previous) {
        demand(previous.operation === operation && previous.hash === hash, 'IDEMPOTENCY_CONFLICT');
        return previous.result;
      }
      const result = await work(session, actor);
      await commands.insertOne(
        {
          _id: new Types.ObjectId(),
          actorId,
          commandId,
          operation,
          hash,
          result,
          purgeAt: new Date(Date.now() + 30 * day),
        },
        { session },
      );
      return result;
    });
  }
  async get(kind: Kind, id: Types.ObjectId, session?: ClientSession) {
    const record = await this.collection(kind).findOne({ _id: id }, session ? { session } : {});
    demand(record, 'RESOURCE_NOT_FOUND', 404);
    return record;
  }
  check(record: RecordDocument, version: number, statuses: string[]) {
    demand(record.version === version, 'VERSION_CONFLICT');
    demand(statuses.includes(record.status), 'INVALID_TRANSITION');
  }
  async save(kind: Kind, record: RecordDocument, session: ClientSession) {
    const version = record.version;
    record.version++;
    record.updatedAt = new Date();
    const result = await this.collection(kind).replaceOne({ _id: record._id, version }, record, {
      session,
    });
    demand(result.matchedCount, 'VERSION_CONFLICT');
  }
  async projectIdentity(userId: Types.ObjectId, session: ClientSession) {
    const latest = await this.collection('verification').findOne(
      { userId },
      { session, sort: { attempt: -1 } },
    );
    const identityStatus =
      latest?.status === 'APPROVED'
        ? 'VERIFIED'
        : latest && ['DRAFT', 'PROVIDER_PENDING', 'REVIEW_PENDING'].includes(latest.status)
          ? 'PENDING'
          : latest && ['REJECTED', 'REVOKED'].includes(latest.status)
            ? 'REJECTED'
            : 'NOT_SUBMITTED';
    const approvedVehicleCount = await this.collection('vehicle').countDocuments(
      { userId, status: 'APPROVED' },
      { session },
    );
    await this.mongo.collection('users').updateOne(
      { _id: userId, status: 'ACTIVE' },
      {
        $set: { identityStatus, identityMode: 'SANDBOX', approvedVehicleCount },
        $inc: { roleVersion: 1 },
      },
      { session },
    );
  }
  async consent(userId: Types.ObjectId, session: ClientSession) {
    demand(
      await this.mongo
        .collection('consents')
        .findOne(
          { userId, policyVersion: POLICY_VERSION, termsAccepted: true, privacyAccepted: true },
          { session },
        ),
      'CONSENT_REQUIRED',
      400,
    );
  }
  async attach(
    kind: 'verification' | 'vehicle',
    record: RecordDocument,
    ids: string[],
    session: ClientSession,
  ) {
    demand(
      ids.length > 0 && ids.length <= 3 && new Set(ids).size === ids.length,
      'EVIDENCE_INVALID',
      400,
    );
    const files = this.mongo.collection<
      FileRecord<Types.ObjectId> & { resourceId?: Types.ObjectId; resourceType?: string }
    >('files');
    const purpose =
      kind === 'verification'
        ? ['IDENTITY_SANDBOX', 'VERIFICATION_SANDBOX']
        : ['VEHICLE_DOCUMENT_SANDBOX'];
    const expiresAt = new Date(Date.now() + 30 * day);
    for (const id of ids) {
      const file = await files.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ownerId: record.userId,
          status: 'READY',
          expiresAt: { $gt: new Date() },
          purpose: { $in: purpose as FileRecord<Types.ObjectId>['purpose'][] },
          resourceId: { $exists: false },
        },
        { $set: { resourceId: record._id, resourceType: kind, expiresAt } },
        { session, returnDocument: 'after' },
      );
      demand(file, 'EVIDENCE_UNAVAILABLE', 409);
    }
    record.evidenceFileIds = ids.map((id) => new Types.ObjectId(id));
    record.expiresAt = expiresAt;
  }
  async evidenceReady(record: RecordDocument, session: ClientSession) {
    const count = await this.mongo.collection('files').countDocuments(
      {
        _id: { $in: record.evidenceFileIds },
        ownerId: record.userId,
        resourceId: record._id,
        status: 'READY',
        expiresAt: { $gt: new Date() },
      },
      { session },
    );
    demand(
      record.evidenceFileIds.length && count === record.evidenceFileIds.length,
      'EVIDENCE_UNAVAILABLE',
    );
    await this.mongo
      .collection('files')
      .updateMany(
        { _id: { $in: record.evidenceFileIds } },
        { $inc: { evidenceVersion: 1 } },
        { session },
      );
  }
  async release(record: RecordDocument, session: ClientSession) {
    // Keep historical linkage. The owner can now delete, but cannot reuse old evidence.
    await this.mongo
      .collection('files')
      .updateMany({ resourceId: record._id }, { $set: { evidenceLocked: false } }, { session });
  }
  async list(kind: Kind, actorId: Types.ObjectId, page: PageInput, admin = false) {
    await this.actor(actorId, undefined, admin);
    const limit = Math.min(page.limit ?? 20, 50);
    const filter = {
      ...(admin || kind === 'community' ? {} : { userId: actorId }),
      ...(kind === 'community' && !admin
        ? { status: 'ACTIVE' }
        : page.status
          ? { status: page.status }
          : {}),
      ...(page.cursor ? { _id: { $lt: new Types.ObjectId(page.cursor) } } : {}),
    };
    const records = await this.collection(kind)
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();
    return {
      items: records.slice(0, limit).map((record) => view(record, admin)),
      nextCursor: records.length > limit ? records[limit - 1]!._id.toHexString() : null,
    };
  }
  async detail(kind: Kind, actorId: Types.ObjectId, id: Types.ObjectId, admin = false) {
    await this.actor(actorId, undefined, admin);
    const record = await this.get(kind, id);
    demand(
      admin || (kind === 'community' ? record.status === 'ACTIVE' : record.userId.equals(actorId)),
      'RESOURCE_NOT_FOUND',
      404,
    );
    return view(record, admin);
  }
  async currentVerification(actorId: Types.ObjectId) {
    const actor = await this.actor(actorId);
    const record = await this.collection('verification').findOne(
      { userId: actorId },
      { sort: { attempt: -1 } },
    );
    return {
      identityStatus: actor.identityStatus ?? 'NOT_SUBMITTED',
      mode: 'SANDBOX',
      application: record ? view(record) : null,
    };
  }
  createVerification(actorId: Types.ObjectId, commandId: string) {
    return this.command(
      actorId,
      commandId,
      'verification.create',
      {},
      false,
      async (session, actor) => {
        demand(actor.phoneStatus === 'VERIFIED', 'PHONE_VERIFICATION_REQUIRED', 403);
        demand(actor.identityStatus !== 'VERIFIED', 'ALREADY_VERIFIED');
        await this.consent(actorId, session);
        demand(
          !(await this.collection('verification').findOne(
            { userId: actorId, active: true },
            { session },
          )),
          'APPLICATION_EXISTS',
        );
        const last = await this.collection('verification').findOne(
          { userId: actorId },
          { session, sort: { attempt: -1 } },
        );
        const record: RecordDocument = {
          _id: new Types.ObjectId(),
          userId: actorId,
          status: 'DRAFT',
          active: true,
          mode: 'SANDBOX',
          attempt: (last?.attempt ?? 0) + 1,
          version: 0,
          evidenceFileIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + day),
        };
        await this.collection('verification').insertOne(record, { session });
        await this.projectIdentity(actorId, session);
        await this.audit(
          session,
          actorId,
          actorId,
          'verification',
          record._id,
          'VERIFICATION_CREATED',
        );
        return view(record);
      },
    );
  }
  submitVerification(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    input: Command & { evidenceFileIds: string[] },
    provider: MockEkycProvider,
  ) {
    return this.command(
      actorId,
      input.commandId,
      `verification.submit:${String(id)}`,
      input,
      false,
      async (session, actor) => {
        demand(actor.phoneStatus === 'VERIFIED', 'PHONE_VERIFICATION_REQUIRED', 403);
        await this.consent(actorId, session);
        const record = await this.get('verification', id, session);
        demand(record.userId.equals(actorId), 'RESOURCE_NOT_FOUND', 404);
        this.check(record, input.expectedVersion, ['DRAFT']);
        demand(record.expiresAt && record.expiresAt > new Date(), 'APPLICATION_EXPIRED');
        await this.attach('verification', record, input.evidenceFileIds, session);
        record.providerRef = provider.createSession().providerRef;
        record.status = 'PROVIDER_PENDING';
        record.expiresAt = new Date(Date.now() + day);
        await this.mongo
          .collection('files')
          .updateMany({ resourceId: id }, { $set: { evidenceLocked: true } }, { session });
        await this.save('verification', record, session);
        await this.audit(session, actorId, actorId, 'verification', id, 'VERIFICATION_SUBMITTED');
        return view(record);
      },
    );
  }
  cancelVerification(actorId: Types.ObjectId, id: Types.ObjectId, input: Command) {
    return this.command(
      actorId,
      input.commandId,
      `verification.cancel:${String(id)}`,
      input,
      false,
      async (session) => {
        const record = await this.get('verification', id, session);
        demand(record.userId.equals(actorId), 'RESOURCE_NOT_FOUND', 404);
        this.check(record, input.expectedVersion, ['DRAFT', 'PROVIDER_PENDING', 'REVIEW_PENDING']);
        record.status = 'CANCELLED';
        record.active = false;
        await this.save('verification', record, session);
        await this.release(record, session);
        await this.projectIdentity(actorId, session);
        await this.audit(session, actorId, actorId, 'verification', id, 'VERIFICATION_CANCELLED');
        return view(record);
      },
    );
  }
  async receive(payload: CallbackPayload, raw: Buffer) {
    const hash = createHash('sha256').update(raw).digest('hex');
    const result = await this.transaction(async (session) => {
      const inbox = this.mongo.collection<CallbackEvent>('webhook_events');
      const previous = await inbox.findOne(
        { provider: 'mock', eventId: payload.eventId },
        { session },
      );
      if (previous) {
        if (previous.payloadHash !== hash) {
          await this.mongo.collection('audit_logs').insertOne(
            {
              event: 'WEBHOOK_EVENT_CONFLICT',
              outcome: 'REJECTED',
              resourceType: 'verification',
              resourceId: previous.applicationId,
              createdAt: new Date(),
            },
            { session },
          );
          return { accepted: false };
        }
        return { accepted: true };
      }
      const record = await this.get(
        'verification',
        new Types.ObjectId(payload.applicationId),
        session,
      );
      demand(
        record.providerRef === payload.providerRef && record.attempt === payload.attempt,
        'WEBHOOK_INVALID',
        400,
      );
      // Do not recreate personal records for locked/deleted accounts.
      const owner = await this.mongo
        .collection<Actor>('users')
        .findOne({ _id: record.userId, status: 'ACTIVE' }, { session });
      if (!owner) return { accepted: true };
      await inbox.insertOne(
        {
          _id: new Types.ObjectId(),
          ...payload,
          applicationId: record._id,
          provider: 'mock',
          payloadHash: hash,
          processingStatus: 'PENDING',
          receivedAt: new Date(),
          purgeAt: new Date(Date.now() + 30 * day),
        },
        { session },
      );
      await this.event(session, EKYC_EVENT, record._id, { callbackEventId: payload.eventId });
      return { accepted: true };
    });
    demand(result.accepted, 'WEBHOOK_EVENT_CONFLICT');
    return result;
  }
  async processCallback(eventId: string) {
    return this.transaction(async (session) => {
      const inbox = this.mongo.collection<CallbackEvent>('webhook_events');
      const event = await inbox.findOne({ provider: 'mock', eventId }, { session });
      if (!event || event.processingStatus !== 'PENDING') return { processed: false };
      const record = await this.collection('verification').findOne(
        { _id: event.applicationId },
        { session },
      );
      const owner =
        record &&
        (await this.mongo
          .collection<Actor>('users')
          .findOne({ _id: record.userId, status: 'ACTIVE' }, { session }));
      const eligible =
        record &&
        owner &&
        record.status === 'PROVIDER_PENDING' &&
        record.active &&
        record.providerRef === event.providerRef &&
        record.attempt === event.attempt &&
        record.expiresAt &&
        record.expiresAt > new Date();
      if (eligible) {
        record.status =
          event.result === 'PASS'
            ? 'REVIEW_PENDING'
            : event.result === 'FAIL'
              ? 'REJECTED'
              : 'EXPIRED';
        record.active = record.status === 'REVIEW_PENDING';
        if (record.active) record.expiresAt = new Date(Date.now() + 7 * day);
        await this.save('verification', record, session);
        if (!record.active) await this.release(record, session);
        await this.projectIdentity(record.userId, session);
        await this.audit(
          session,
          undefined,
          record.userId,
          'verification',
          record._id,
          `SANDBOX_${event.result}`,
        );
      }
      await inbox.updateOne(
        { _id: event._id },
        { $set: { processingStatus: eligible ? 'PROCESSED' : 'IGNORED' } },
        { session },
      );
      return { processed: !!eligible };
    });
  }
  runSandbox(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    input: Command & { scenario: 'PASS' | 'FAIL' | 'PENDING' | 'EXPIRED' | 'TIMEOUT' },
  ) {
    return this.command(
      actorId,
      input.commandId,
      `sandbox.run:${String(id)}`,
      input,
      true,
      async (session) => {
        const record = await this.get('verification', id, session);
        this.check(record, input.expectedVersion, ['PROVIDER_PENDING']);
        await this.actor(record.userId, session);
        demand(record.expiresAt && record.expiresAt > new Date(), 'APPLICATION_EXPIRED');
        if (
          input.scenario === 'PASS' ||
          input.scenario === 'FAIL' ||
          input.scenario === 'EXPIRED'
        ) {
          const payload: CallbackPayload = {
            eventId: input.commandId,
            applicationId: String(id),
            providerRef: record.providerRef!,
            attempt: record.attempt!,
            result: input.scenario,
          };
          await this.event(session, EKYC_DELIVERY, id, {
            ...payload,
            callbackEventId: payload.eventId,
          });
        } else if (input.scenario === 'TIMEOUT') {
          record.expiresAt = new Date();
          await this.save('verification', record, session);
        }
        await this.audit(
          session,
          actorId,
          record.userId,
          'verification',
          id,
          `SANDBOX_RUN_${input.scenario}`,
        );
        return { accepted: true };
      },
    );
  }
  vehicleInput(input: VehicleInput) {
    demand(
      input.passengerCapacity >= 1 &&
        input.passengerCapacity <= (input.type === 'MOTORBIKE' ? 1 : 8),
      'VEHICLE_CAPACITY_INVALID',
      400,
    );
    return {
      ...input,
      model: input.model.trim(),
      color: input.color.trim(),
      syntheticPlate: input.syntheticPlate.trim().toUpperCase(),
    };
  }
  createVehicle(actorId: Types.ObjectId, input: VehicleInput & { commandId: string }) {
    return this.command(
      actorId,
      input.commandId,
      'vehicle.create',
      input,
      false,
      async (session) => {
        demand(
          (await this.collection('vehicle').countDocuments(
            { userId: actorId, status: { $ne: 'ARCHIVED' } },
            { session },
          )) < 10,
          'VEHICLE_QUOTA',
          429,
        );
        const fields = this.vehicleInput(input);
        const record: RecordDocument = {
          _id: new Types.ObjectId(),
          userId: actorId,
          type: fields.type,
          model: fields.model,
          color: fields.color,
          syntheticPlate: fields.syntheticPlate,
          passengerCapacity: fields.passengerCapacity,
          status: 'DRAFT',
          version: 0,
          evidenceFileIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await this.collection('vehicle').insertOne(record, { session });
        await this.audit(session, actorId, actorId, 'vehicle', record._id, 'VEHICLE_CREATED');
        return view(record);
      },
    );
  }
  updateVehicle(actorId: Types.ObjectId, id: Types.ObjectId, input: VehicleInput & Command) {
    return this.command(
      actorId,
      input.commandId,
      `vehicle.update:${String(id)}`,
      input,
      false,
      async (session) => {
        const record = await this.get('vehicle', id, session);
        demand(record.userId.equals(actorId), 'RESOURCE_NOT_FOUND', 404);
        this.check(record, input.expectedVersion, ['DRAFT', 'APPROVED', 'REJECTED', 'REVOKED']);
        const fields = this.vehicleInput(input);
        Object.assign(record, {
          type: fields.type,
          model: fields.model,
          color: fields.color,
          syntheticPlate: fields.syntheticPlate,
          passengerCapacity: fields.passengerCapacity,
          status: 'DRAFT',
        });
        await this.release(record, session);
        record.evidenceFileIds = [];
        delete record.decision;
        await this.save('vehicle', record, session);
        await this.projectIdentity(actorId, session);
        await this.audit(session, actorId, actorId, 'vehicle', id, 'VEHICLE_EDITED');
        return view(record);
      },
    );
  }
  vehicleAction(
    actorId: Types.ObjectId,
    id: Types.ObjectId,
    input: Command & { evidenceFileIds?: string[] },
    action: 'submit' | 'withdraw' | 'archive',
  ) {
    return this.command(
      actorId,
      input.commandId,
      `vehicle.${action}:${String(id)}`,
      input,
      false,
      async (session, actor) => {
        const record = await this.get('vehicle', id, session);
        demand(record.userId.equals(actorId), 'RESOURCE_NOT_FOUND', 404);
        this.check(
          record,
          input.expectedVersion,
          action === 'submit'
            ? ['DRAFT']
            : action === 'withdraw'
              ? ['PENDING']
              : ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'],
        );
        if (action === 'submit') {
          demand(verified(actor), 'IDENTITY_REQUIRED', 403);
          await this.consent(actorId, session);
          await this.attach('vehicle', record, input.evidenceFileIds ?? [], session);
          await this.mongo
            .collection('files')
            .updateMany({ resourceId: id }, { $set: { evidenceLocked: true } }, { session });
          record.status = 'PENDING';
        } else {
          await this.release(record, session);
          record.status = action === 'withdraw' ? 'DRAFT' : 'ARCHIVED';
          if (action === 'withdraw') record.evidenceFileIds = [];
        }
        await this.save('vehicle', record, session);
        await this.projectIdentity(actorId, session);
        await this.audit(
          session,
          actorId,
          actorId,
          'vehicle',
          id,
          `VEHICLE_${action.toUpperCase()}`,
        );
        return view(record);
      },
    );
  }
  saveCommunity(
    actorId: Types.ObjectId,
    id: Types.ObjectId | undefined,
    input: CommunityInput & Command,
  ) {
    return this.command(
      actorId,
      input.commandId,
      `community.save:${id ? String(id) : 'new'}`,
      input,
      true,
      async (session) => {
        const record: RecordDocument = id
          ? await this.get('community', id, session)
          : {
              _id: new Types.ObjectId(),
              userId: actorId,
              status: 'ACTIVE',
              version: 0,
              evidenceFileIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
        if (id) this.check(record, input.expectedVersion, ['ACTIVE']);
        Object.assign(record, {
          slug: input.slug,
          name: input.name.trim(),
          type: input.type,
          description: input.description.trim(),
        });
        if (id) await this.save('community', record, session);
        else await this.collection('community').insertOne(record, { session });
        await this.audit(session, actorId, actorId, 'community', record._id, 'COMMUNITY_SAVED');
        return view(record);
      },
    );
  }
  archiveCommunity(actorId: Types.ObjectId, id: Types.ObjectId, input: Command) {
    return this.command(
      actorId,
      input.commandId,
      `community.archive:${String(id)}`,
      input,
      true,
      async (session) => {
        const record = await this.get('community', id, session);
        this.check(record, input.expectedVersion, ['ACTIVE']);
        record.status = 'ARCHIVED';
        await this.save('community', record, session);
        await this.audit(session, actorId, actorId, 'community', id, 'COMMUNITY_ARCHIVED');
        return view(record);
      },
    );
  }
  membershipAction(
    actorId: Types.ObjectId,
    communityId: Types.ObjectId,
    input: Command & { requestReason?: string },
    action: 'join' | 'cancel' | 'leave',
  ) {
    return this.command(
      actorId,
      input.commandId,
      `membership.${action}:${String(communityId)}`,
      input,
      false,
      async (session, actor) => {
        const community = await this.get('community', communityId, session);
        let record = await this.collection('membership').findOne(
          { userId: actorId, communityId },
          { session },
        );
        if (action === 'join') {
          demand(actor.phoneStatus === 'VERIFIED', 'PHONE_VERIFICATION_REQUIRED', 403);
          demand(community.status === 'ACTIVE', 'COMMUNITY_UNAVAILABLE');
          if (record && ['PENDING', 'APPROVED'].includes(record.status)) return view(record);
          if (record) {
            this.check(record, input.expectedVersion, ['REJECTED', 'CANCELLED', 'LEFT', 'REVOKED']);
            demand(
              !record.cooldownUntil || record.cooldownUntil <= new Date(),
              'MEMBERSHIP_COOLDOWN',
              429,
            );
          }
          if (!record) {
            record = {
              _id: new Types.ObjectId(),
              userId: actorId,
              communityId,
              status: 'PENDING',
              version: 0,
              evidenceFileIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              requestReason: input.requestReason ?? '',
            };
            await this.collection('membership').insertOne(record, { session });
          } else {
            record.status = 'PENDING';
            record.requestReason = input.requestReason ?? '';
            delete record.decision;
            await this.save('membership', record, session);
          }
        } else {
          demand(record, 'RESOURCE_NOT_FOUND', 404);
          this.check(
            record,
            input.expectedVersion,
            action === 'cancel' ? ['PENDING'] : ['APPROVED'],
          );
          record.status = action === 'cancel' ? 'CANCELLED' : 'LEFT';
          record.cooldownUntil = new Date(Date.now() + (action === 'leave' ? 7 * day : 0));
          await this.save('membership', record, session);
        }
        await this.audit(
          session,
          actorId,
          actorId,
          'membership',
          record._id,
          `MEMBERSHIP_${action.toUpperCase()}`,
        );
        return view(record);
      },
    );
  }
  async isActiveCommunityMember(userId: Types.ObjectId, communityId: Types.ObjectId) {
    return this.transaction(async (session) => {
      const user = await this.mongo
        .collection<Actor>('users')
        .findOne({ _id: userId, status: 'ACTIVE' }, { session });
      const community = await this.collection('community').findOne(
        { _id: communityId, status: 'ACTIVE' },
        { session },
      );
      return !!(
        user &&
        community &&
        (await this.collection('membership').findOne(
          { userId, communityId, status: 'APPROVED' },
          { session },
        ))
      );
    });
  }
  decision(
    actorId: Types.ObjectId,
    kind: 'verification' | 'vehicle' | 'membership',
    id: Types.ObjectId,
    input: Command & { action: 'APPROVE' | 'REJECT' | 'REVOKE'; reason: string },
  ) {
    return this.command(
      actorId,
      input.commandId,
      `${kind}.decision:${String(id)}`,
      input,
      true,
      async (session) => {
        const record = await this.get(kind, id, session);
        demand(!record.userId.equals(actorId), 'SELF_REVIEW_FORBIDDEN', 403);
        const target = await this.actor(record.userId, session);
        this.check(
          record,
          input.expectedVersion,
          input.action === 'REVOKE'
            ? ['APPROVED']
            : kind === 'verification'
              ? ['REVIEW_PENDING']
              : ['PENDING'],
        );
        demand(input.reason.trim().length >= 3, 'REASON_REQUIRED', 400);
        if (input.action === 'APPROVE') {
          if (kind === 'verification') {
            demand(target.phoneStatus === 'VERIFIED', 'PHONE_VERIFICATION_REQUIRED');
            demand(record.expiresAt && record.expiresAt > new Date(), 'APPLICATION_EXPIRED');
          }
          if (kind === 'vehicle') demand(verified(target), 'IDENTITY_REQUIRED');
          if (kind === 'membership')
            demand(
              (await this.get('community', record.communityId!, session)).status === 'ACTIVE',
              'COMMUNITY_UNAVAILABLE',
            );
          else await this.evidenceReady(record, session);
        }
        record.status =
          input.action === 'APPROVE'
            ? 'APPROVED'
            : input.action === 'REJECT'
              ? 'REJECTED'
              : 'REVOKED';
        record.decision = {
          action: input.action,
          reason: input.reason.trim(),
          actorId,
          at: new Date(),
        };
        if (kind === 'verification') record.active = false;
        if (kind === 'membership' && record.status !== 'APPROVED')
          record.cooldownUntil = new Date(Date.now() + 7 * day);
        await this.save(kind, record, session);
        if (kind !== 'membership') {
          await this.release(record, session);
          await this.projectIdentity(record.userId, session);
        }
        await this.audit(
          session,
          actorId,
          record.userId,
          kind,
          id,
          `${kind.toUpperCase()}_${input.action}`,
          input.reason.trim(),
        );
        return view(record, true);
      },
    );
  }
  async evidenceAccess(
    actorId: Types.ObjectId,
    kind: 'verification' | 'vehicle',
    id: Types.ObjectId,
    fileId: Types.ObjectId,
    reason: string,
  ) {
    demand(reason.trim().length >= 3, 'REASON_REQUIRED', 400);
    return this.transaction(async (session) => {
      await this.actor(actorId, session, true);
      const record = await this.get(kind, id, session);
      await this.actor(record.userId, session);
      demand(
        ['PROVIDER_PENDING', 'REVIEW_PENDING', 'PENDING', 'APPROVED'].includes(record.status) &&
          record.evidenceFileIds.some((item) => item.equals(fileId)),
        'EVIDENCE_UNAVAILABLE',
        404,
      );
      const file = await this.mongo.collection<FileRecord<Types.ObjectId>>('files').findOne(
        {
          _id: fileId,
          ownerId: record.userId,
          resourceId: id,
          resourceType: kind,
          status: 'READY',
          expiresAt: { $gt: new Date() },
        },
        { session },
      );
      demand(file, 'EVIDENCE_UNAVAILABLE', 404);
      await this.mongo
        .collection('files')
        .updateOne({ _id: fileId }, { $inc: { evidenceVersion: 1 } }, { session });
      await this.audit(
        session,
        actorId,
        record.userId,
        kind,
        id,
        'EVIDENCE_READ_AUTHORIZED',
        reason,
      );
      // Signing is local, no object fetch. URL is returned only if the audit transaction commits.
      return {
        url: await this.storage.presignDownload(file.finalKey),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    });
  }
  async auditList(actorId: Types.ObjectId, kind: Kind, id: Types.ObjectId, page: PageInput) {
    await this.actor(actorId, undefined, true);
    await this.get(kind, id);
    const limit = Math.min(page.limit ?? 20, 50);
    const records = await this.mongo
      .collection('audit_logs')
      .find({
        resourceType: kind,
        resourceId: id,
        ...(page.cursor ? { _id: { $lt: new Types.ObjectId(page.cursor) } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();
    return {
      items: records.slice(0, limit).map((r) => ({
        id: String(r._id),
        event: String(r.event),
        reason: r.reason as string | undefined,
        actorId: r.actorId ? String(r.actorId) : undefined,
        createdAt: (r.createdAt as Date).toISOString(),
      })),
      nextCursor: records.length > limit ? String(records[limit - 1]!._id) : null,
    };
  }
  async expire(now = new Date()) {
    for (const kind of ['verification', 'vehicle'] as const) {
      const pending = await this.collection(kind)
        .find({
          status: {
            $in:
              kind === 'verification'
                ? ['DRAFT', 'PROVIDER_PENDING', 'REVIEW_PENDING']
                : ['PENDING'],
          },
          expiresAt: { $lte: now },
        })
        .limit(50)
        .toArray();
      for (const item of pending)
        await this.transaction(async (session) => {
          const record = await this.get(kind, item._id, session);
          if (record.version !== item.version) return false;
          record.status = kind === 'verification' ? 'EXPIRED' : 'REJECTED';
          record.active = false;
          record.decision = {
            action: 'EXPIRE',
            reason: 'Sandbox evidence or session expired',
            actorId: record.userId,
            at: now,
          };
          await this.save(kind, record, session);
          await this.release(record, session);
          await this.projectIdentity(record.userId, session);
          await this.audit(session, undefined, record.userId, kind, record._id, 'WORKFLOW_EXPIRED');
          return true;
        });
    }
  }
}
