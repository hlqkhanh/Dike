import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import mongoose, { Types, type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectStorage } from '@dike/storage';
import { MockEkycProvider, WorkflowStore, type CallbackPayload } from '@dike/workflows';
import { POLICY_VERSION } from '@dike/contracts';
import { createApplication } from '../src/bootstrap.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';
import { MigrationRunner } from '../src/database/migrations.js';
import { FilesService } from '../src/files/files.service.js';
import { UsersService } from '../src/users/users.service.js';
import { CryptoService } from '../src/auth/crypto.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { UserDocument, SessionDocument } from '../src/auth/auth.types.js';
const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;
integration('Stage 5 real local infrastructure', () => {
  const database = `dike_stage5_${randomUUID().replaceAll('-', '')}`;
  let mongo: Connection,
    storage: ObjectStorage,
    store: WorkflowStore,
    files: FilesService,
    users: UsersService,
    app: INestApplication,
    config: ApiConfig,
    base: string,
    crypto: CryptoService;
  const provider = new MockEkycProvider('stage-five-independent-test-webhook-material');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNw2T3TZfdMBggFACtaBmFVEAwZAAAAAElFTkSuQmCC',
    'base64',
  );
  beforeAll(async () => {
    const source = loadApiConfig();
    if (!['local', 'test'].includes(source.APP_ENV))
      throw new Error('Local infrastructure required');
    const uri = new URL(source.MONGODB_URI);
    uri.pathname = `/${database}`;
    config = {
      ...source,
      APP_ENV: 'test',
      MONGODB_URI: uri.toString(),
      AUTH_RATE_LIMIT_PREFIX: database,
      EKYC_PROVIDER: 'mock',
      EKYC_WEBHOOK_SECRET: 'stage-five-independent-test-webhook-material',
    };
    mongo = await mongoose
      .createConnection(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 })
      .asPromise();
    await new MigrationRunner(mongo).up();
    await new MigrationRunner(mongo).up();
    storage = new ObjectStorage(config);
    await storage.ready();
    store = new WorkflowStore(mongo, storage);
    files = new FilesService(mongo, config, storage);
    users = new UsersService(mongo, config);
    app = await createApplication({ mode: 'runtime', config });
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo };
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    crypto = app.get(CryptoService);
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    if (mongo) {
      if (storage)
        for (const file of await mongo.collection('files').find({}).toArray()) {
          await storage.remove(file.uploadKey as string, false);
          await storage.remove(file.finalKey as string, file.purpose === 'AVATAR');
        }
      if (mongo.name !== database || !database.startsWith('dike_stage5_'))
        throw new Error('Unexpected database');
      await mongo.dropDatabase();
      await mongo.close();
    }
    storage?.close();
  });
  async function actor(admin = false) {
    const id = new Types.ObjectId(),
      now = new Date(),
      token = crypto.randomToken(),
      sessionId = randomUUID();
    await mongo.collection<UserDocument>('users').insertOne({
      _id: id,
      status: 'ACTIVE',
      phoneStatus: 'VERIFIED',
      identityStatus: 'NOT_SUBMITTED',
      identityMode: 'SANDBOX',
      approvedVehicleCount: 0,
      roles: admin ? ['MEMBER', 'ADMIN'] : ['MEMBER'],
      displayName: 'Synthetic account',
      avatarUrl: null,
      roleVersion: 0,
      phoneVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    await mongo.collection('consents').insertOne({
      userId: id,
      policyVersion: POLICY_VERSION,
      termsAccepted: true,
      privacyAccepted: true,
      analytics: false,
      createdAt: now,
    });
    await mongo.collection<SessionDocument>('sessions').insertOne({
      _id: new Types.ObjectId(),
      userId: id,
      sessionId,
      accessTokenHash: crypto.hashToken(token),
      accessTokenKeyId: crypto.activeAuthKeyId(),
      accessExpiresAt: new Date(Date.now() + 900000),
      refreshTokenHash: crypto.hashToken(crypto.randomToken()),
      refreshTokenKeyId: crypto.activeAuthKeyId(),
      refreshCounter: 0,
      absoluteExpiresAt: new Date(Date.now() + day),
      createdAt: now,
      lastSeenAt: now,
      lastRefreshedAt: now,
      deviceSummary: { browser: 'Test', operatingSystem: 'Test', deviceType: 'UNKNOWN' },
      ipHash: 'synthetic',
      purgeAt: new Date(Date.now() + day),
    });
    return { id, token, csrf: crypto.csrfToken(sessionId, 0) };
  }
  const day = 86400000;
  const command = (version: number) => ({ commandId: randomUUID(), expectedVersion: version });
  async function upload(
    owner: Types.ObjectId,
    purpose: 'IDENTITY_SANDBOX' | 'VEHICLE_DOCUMENT_SANDBOX',
  ) {
    const upload = await files.create(owner, {
      purpose,
      contentType: 'image/png',
      size: png.length,
    });
    expect(
      (
        await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: png,
        })
      ).ok,
    ).toBe(true);
    await files.complete(owner, new Types.ObjectId(upload.fileId));
    return upload.fileId;
  }
  async function application(owner: Types.ObjectId) {
    const created = await store.createVerification(owner, randomUUID());
    const id = new Types.ObjectId(created.id);
    const fileId = await upload(owner, 'IDENTITY_SANDBOX');
    const submitted = await store.submitVerification(
      owner,
      id,
      { ...command(created.version), evidenceFileIds: [fileId] },
      provider,
    );
    return { id, fileId, submitted };
  }
  async function callback(
    id: Types.ObjectId,
    result: 'PASS' | 'FAIL' = 'PASS',
    eventId = randomUUID(),
  ) {
    const record = await store.get('verification', id);
    const payload: CallbackPayload = {
      eventId,
      applicationId: String(id),
      attempt: record.attempt!,
      providerRef: record.providerRef!,
      result,
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Date.now());
    const response = await fetch(`${base}/webhooks/ekyc/mock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ekyc-key-id': 'local-v1',
        'x-ekyc-timestamp': timestamp,
        'x-ekyc-signature': provider.sign(raw, timestamp),
      },
      body: raw,
    });
    return { response, payload, raw };
  }
  async function signed(
    method: string,
    path: string,
    user: Awaited<ReturnType<typeof actor>>,
    body?: unknown,
    csrf = true,
  ) {
    const raw = body === undefined ? '' : JSON.stringify(body),
      timestamp = String(Date.now()),
      nonce = crypto.randomToken(),
      requestId = randomUUID();
    const signature = crypto.signBff(
      [
        method,
        `/api/v1${path}`,
        requestId,
        timestamp,
        nonce,
        createHash('sha256').update(raw).digest('hex'),
      ].join('\n'),
      config.BFF_ACTIVE_KEY_ID,
    );
    return fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
        'x-request-id': requestId,
        'x-dike-bff-key-id': config.BFF_ACTIVE_KEY_ID,
        'x-dike-bff-timestamp': timestamp,
        'x-dike-bff-nonce': nonce,
        'x-dike-bff-signature': signature,
        ...(csrf ? { 'x-csrf-token': user.csrf } : {}),
      },
      ...(body === undefined ? {} : { body: raw }),
    });
  }
  it('enforces HTTP boundary, strict DTO and owner/admin separation', async () => {
    const member = await actor();
    expect((await signed('GET', '/admin/verifications', member)).status).toBe(403);
    expect(
      (
        await signed(
          'POST',
          '/verification/applications',
          member,
          { commandId: randomUUID() },
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await signed('POST', '/verification/applications', member, {
          commandId: randomUUID(),
          identityStatus: 'VERIFIED',
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${base}/me/verification`)).status).toBe(401);
    const valid = await signed('POST', '/verification/applications', member, {
      commandId: randomUUID(),
    });
    expect(valid.status).toBe(201);
  });
  it('deduplicates callbacks, requires review and applies driver/community permissions', async () => {
    const member = await actor(),
      admin = await actor(true),
      other = await actor();
    const draftKey = randomUUID();
    const draft = await store.createVerification(member.id, draftKey);
    expect(await store.createVerification(member.id, draftKey)).toEqual(draft);
    const id = new Types.ObjectId(draft.id),
      fileId = await upload(member.id, 'IDENTITY_SANDBOX');
    const submission = { ...command(0), evidenceFileIds: [fileId] };
    await store.submitVerification(member.id, id, submission, provider);
    await expect(files.remove(member.id, new Types.ObjectId(fileId))).rejects.toMatchObject({
      code: 'EVIDENCE_LOCKED',
    });
    await expect(
      store.evidenceAccess(
        other.id,
        'verification',
        id,
        new Types.ObjectId(fileId),
        'Synthetic check',
      ),
    ).rejects.toMatchObject({ code: 'ROLE_REQUIRED' });
    const event = await callback(id);
    expect(event.response.status).toBe(201);
    expect(await store.receive(event.payload, event.raw)).toEqual({ accepted: true });
    await expect(
      store.receive(
        { ...event.payload, result: 'FAIL' },
        Buffer.from(JSON.stringify({ ...event.payload, result: 'FAIL' })),
      ),
    ).rejects.toMatchObject({ code: 'WEBHOOK_EVENT_CONFLICT' });
    await store.processCallback(event.payload.eventId);
    await store.processCallback(event.payload.eventId);
    expect(await app.get(AuthService).getSession(member.token)).toMatchObject({
      user: { roles: ['MEMBER'] },
    });
    const review = await store.get('verification', id);
    const decisions = await Promise.allSettled([
      store.decision(admin.id, 'verification', id, {
        ...command(review.version),
        action: 'APPROVE',
        reason: 'Synthetic pass',
      }),
      store.decision(admin.id, 'verification', id, {
        ...command(review.version),
        action: 'REJECT',
        reason: 'Competing decision',
      }),
    ]);
    expect(decisions.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    // Whichever concurrent decision wins is terminal; use another attempt if rejected.
    let approvedId = id;
    if ((await store.get('verification', id)).status === 'REJECTED') {
      const second = await application(member.id);
      const pass = await callback(second.id);
      await store.processCallback(pass.payload.eventId);
      const pending = await store.get('verification', second.id);
      await store.decision(admin.id, 'verification', second.id, {
        ...command(pending.version),
        action: 'APPROVE',
        reason: 'Synthetic pass',
      });
      approvedId = second.id;
    }
    expect(await app.get(AuthService).getSession(member.token)).toMatchObject({
      user: { roles: ['MEMBER', 'VERIFIED_MEMBER'] },
    });
    const vehicle = await store.createVehicle(member.id, {
      commandId: randomUUID(),
      type: 'CAR',
      model: 'Synthetic car',
      color: 'Blue',
      syntheticPlate: `SYNTH-${randomUUID().slice(0, 8).toUpperCase()}`,
      passengerCapacity: 3,
    });
    const vehicleId = new Types.ObjectId(vehicle.id),
      vehicleFile = await upload(member.id, 'VEHICLE_DOCUMENT_SANDBOX');
    const pendingVehicle = await store.vehicleAction(
      member.id,
      vehicleId,
      { ...command(vehicle.version), evidenceFileIds: [vehicleFile] },
      'submit',
    );
    const approved = await store.decision(admin.id, 'vehicle', vehicleId, {
      ...command(pendingVehicle.version),
      action: 'APPROVE',
      reason: 'Synthetic vehicle',
    });
    const live = await app.get(AuthService).getSession(member.token);
    expect(live.authenticated && live.user.roles).toContain('APPROVED_DRIVER');
    await store.updateVehicle(member.id, vehicleId, {
      ...command(approved.version),
      type: 'CAR',
      model: 'Edited synthetic car',
      color: 'Blue',
      syntheticPlate: vehicle.syntheticPlate!,
      passengerCapacity: 2,
    });
    const changed = await app.get(AuthService).getSession(member.token);
    expect(changed.authenticated && changed.user.roles).not.toContain('APPROVED_DRIVER');
    const community = await store.saveCommunity(admin.id, undefined, {
      ...command(0),
      slug: `test-${randomUUID()}`,
      name: 'Synthetic School',
      type: 'SCHOOL',
      description: '',
    });
    const communityId = new Types.ObjectId(community.id);
    const membership = await store.membershipAction(
      member.id,
      communityId,
      { ...command(0), requestReason: 'Synthetic join' },
      'join',
    );
    expect(await store.isActiveCommunityMember(member.id, communityId)).toBe(false);
    await store.decision(admin.id, 'membership', new Types.ObjectId(membership.id), {
      ...command(membership.version),
      action: 'APPROVE',
      reason: 'Synthetic member',
    });
    expect(await store.isActiveCommunityMember(member.id, communityId)).toBe(true);
    await store.archiveCommunity(admin.id, communityId, command(community.version));
    expect(await store.isActiveCommunityMember(member.id, communityId)).toBe(false);
    const beforeDelete = await store.get('verification', approvedId);
    await users.requestDeletion(member.id);
    await expect(
      store.decision(admin.id, 'verification', approvedId, {
        ...command(beforeDelete.version),
        action: 'REVOKE',
        reason: 'Account is locked',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    await expect(
      store.evidenceAccess(
        admin.id,
        'verification',
        approvedId,
        new Types.ObjectId(fileId),
        'Read after deletion',
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
  }, 30000);
  it('rejects self review and ignores callbacks after cancellation or expiry', async () => {
    const admin = await actor(true),
      submitted = await application(admin.id);
    const pass = await callback(submitted.id);
    await store.processCallback(pass.payload.eventId);
    const pending = await store.get('verification', submitted.id);
    await expect(
      store.decision(admin.id, 'verification', submitted.id, {
        ...command(pending.version),
        action: 'APPROVE',
        reason: 'Self approval',
      }),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW_FORBIDDEN' });
    await store.cancelVerification(admin.id, submitted.id, command(pending.version));
    const late = await callback(submitted.id);
    await store.processCallback(late.payload.eventId);
    expect((await store.get('verification', submitted.id)).status).toBe('CANCELLED');
    const expired = await application(admin.id);
    await store.runSandbox(admin.id, expired.id, {
      ...command(expired.submitted.version),
      scenario: 'TIMEOUT',
    });
    await store.expire();
    expect((await store.get('verification', expired.id)).status).toBe('EXPIRED');
  }, 30000);
});
