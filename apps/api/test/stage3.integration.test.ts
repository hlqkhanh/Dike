import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import mongoose, { Types, type Connection } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../src/bootstrap.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';
import { MigrationRunner } from '../src/database/migrations.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthRepository } from '../src/auth/auth.repository.js';
import { CryptoService } from '../src/auth/crypto.service.js';
import type { UserDocument, SessionDocument } from '../src/auth/auth.types.js';
import { PhoneVerificationService } from '../src/phone-verification/phone-verification.service.js';
import { ChallengeStore } from '../src/phone-verification/challenge.store.js';
import { FakeOtpProvider } from '../src/phone-verification/otp-provider.js';
import { RoleRepository } from '../src/authorization/role.repository.js';
import { AuthorizationService } from '../src/authorization/authorization.service.js';

const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;
integration('Stage 3 real MongoDB and Redis', () => {
  let app: INestApplication;
  let connection: Connection;
  let redis: Redis;
  let config: ApiConfig;
  let crypto: CryptoService;
  let auth: AuthService;
  let otp: PhoneVerificationService;
  let store: ChallengeStore;
  let roles: RoleRepository;
  let repository: AuthRepository;
  const database = `dike_stage3_${randomUUID().replaceAll('-', '')}`;
  const request = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as Request;
  beforeAll(async () => {
    const uri = new URL(process.env.MONGODB_URI!);
    uri.pathname = `/${database}`;
    config = {
      ...loadApiConfig(),
      APP_ENV: 'test',
      MONGODB_URI: uri.toString(),
      OTP_PROVIDER: 'fake',
      OTP_DEV_EXPOSE_CODE: true,
      REQUIRE_PHONE_OTP: true,
      AUTH_RATE_LIMIT_PREFIX: database,
    };
    connection = await mongoose.createConnection(config.MONGODB_URI).asPromise();
    await new MigrationRunner(connection).up();
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
    app = await createApplication({ mode: 'runtime', config });
    await app.init();
    crypto = app.get(CryptoService);
    auth = app.get(AuthService);
    otp = app.get(PhoneVerificationService);
    store = app.get(ChallengeStore);
    repository = new AuthRepository(connection, crypto);
    roles = new RoleRepository(connection);
  }, 30000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      ['users', 'sessions', 'audit_logs', 'phone_verifications'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
    const keys = await redis.keys(`${database}:*`);
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (redis) {
      const keys = await redis.keys(`${database}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
    if (app) await app.close();
    if (connection) {
      if (connection.name !== database || !database.startsWith('dike_stage3_'))
        throw new Error('Unexpected test database');
      await connection.dropDatabase();
      await connection.close();
    }
  });
  async function fixture(phone = '+84901234567', verified = false) {
    const id = new Types.ObjectId();
    const token = crypto.randomToken();
    const sessionId = randomUUID();
    const now = new Date();
    const user: UserDocument = {
      _id: id,
      status: 'ACTIVE',
      displayName: 'Stage 3 test',
      avatarUrl: null,
      phone: crypto.encrypt(phone, `user:${id.toHexString()}:phone`),
      phoneLookupHash: crypto.lookupHash(phone),
      phoneStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
      roles: verified ? ['MEMBER', 'VERIFIED_MEMBER'] : ['MEMBER'],
      roleVersion: 0,
      phoneVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    await connection.collection<UserDocument>('users').insertOne(user);
    const session: SessionDocument = {
      _id: new Types.ObjectId(),
      sessionId,
      userId: id,
      accessTokenHash: crypto.hashToken(token),
      accessTokenKeyId: crypto.activeAuthKeyId(),
      accessExpiresAt: new Date(Date.now() + 900000),
      refreshTokenHash: crypto.hashToken(crypto.randomToken()),
      refreshTokenKeyId: crypto.activeAuthKeyId(),
      refreshCounter: 0,
      absoluteExpiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      lastSeenAt: now,
      lastRefreshedAt: now,
      deviceSummary: { browser: 'Test', operatingSystem: 'Test', deviceType: 'UNKNOWN' },
      ipHash: crypto.ipHash('127.0.0.1'),
      purgeAt: new Date(Date.now() + 86400000),
    };
    await connection.collection<SessionDocument>('sessions').insertOne(session);
    return { id, token, csrf: crypto.csrfToken(sessionId, 0), user };
  }
  async function alterChallenge(id: Types.ObjectId, change: Record<string, unknown>) {
    const key = `${database}:otp:challenge:${id.toHexString()}`;
    const current = JSON.parse((await redis.get(key))!) as Record<string, unknown>;
    await redis.set(key, JSON.stringify({ ...current, ...change }), 'EX', 86400);
  }
  it('verifies once, updates live-session roles, preserves same-number verification and hides plaintext', async () => {
    const user = await fixture();
    const challenge = await otp.start(user.token, user.csrf, request);
    const result = await otp.verify(
      user.token,
      user.csrf,
      challenge.challengeId,
      challenge.developmentCode!,
      request,
    );
    expect(result).toMatchObject({
      user: { phoneStatus: 'VERIFIED', roles: ['MEMBER'] },
      onboarding: { nextAction: 'NONE' },
    });
    await expect(
      otp.verify(user.token, user.csrf, challenge.challengeId, challenge.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'OTP_CHALLENGE_NOT_FOUND' });
    const same = await repository.updatePhone(
      user.id,
      user.user.phone!,
      user.user.phoneLookupHash!,
    );
    expect(same?.phoneStatus).toBe('VERIFIED');
    expect(same?.phoneVersion).toBe(0);
    for (const collection of ['users', 'audit_logs', 'phone_verifications']) {
      const text = JSON.stringify(await connection.collection(collection).find().toArray());
      expect(text).not.toContain('+84901234567');
      expect(text).not.toContain(challenge.developmentCode!);
    }
    const stored = await redis.get(`${database}:otp:challenge:${user.id.toHexString()}`);
    expect(stored).not.toContain(challenge.developmentCode!);
    expect(stored).not.toContain('+84901234567');
  });
  it('enforces cooldown, attempts, expiry, session binding and phone version', async () => {
    const user = await fixture();
    const challenge = await otp.start(user.token, user.csrf, request);
    await expect(otp.start(user.token, user.csrf, request)).rejects.toMatchObject({
      code: 'OTP_RESEND_TOO_SOON',
    });
    const wrong = String((Number(challenge.developmentCode) + 1) % 1000000).padStart(6, '0');
    for (let i = 0; i < 5; i++)
      await expect(
        otp.verify(user.token, user.csrf, challenge.challengeId, wrong, request),
      ).rejects.toMatchObject({ code: i === 4 ? 'OTP_ATTEMPTS_EXHAUSTED' : 'OTP_CODE_INVALID' });
    await expect(
      otp.verify(user.token, user.csrf, challenge.challengeId, challenge.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'OTP_ATTEMPTS_EXHAUSTED' });
    await alterChallenge(user.id, {
      attemptsRemaining: 5,
      status: 'PENDING',
      expiresAt: Date.now() - 1,
    });
    await expect(
      otp.verify(user.token, user.csrf, challenge.challengeId, challenge.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'OTP_CHALLENGE_EXPIRED' });
    await alterChallenge(user.id, {
      expiresAt: Date.now() + 60000,
      sessionIdHash: 'different-session',
    });
    await expect(
      otp.verify(user.token, user.csrf, challenge.challengeId, challenge.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'PHONE_CHANGED' });
    await repository.updatePhone(
      user.id,
      crypto.encrypt('+84901234568', `user:${user.id.toHexString()}:phone`),
      crypto.lookupHash('+84901234568'),
    );
    await expect(
      otp.verify(user.token, user.csrf, challenge.challengeId, challenge.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'PHONE_CHANGED' });
  });
  it('serializes simultaneous sends and verifies, and resumes a committed finalization after a crash', async () => {
    const user = await fixture();
    const sends = await Promise.allSettled([
      otp.start(user.token, user.csrf, request),
      otp.start(user.token, user.csrf, request),
    ]);
    expect(sends.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const challenge = sends.find((result) => result.status === 'fulfilled')!;
    if (challenge.status !== 'fulfilled') throw new Error('No challenge');
    const value = challenge.value;
    const verifies = await Promise.allSettled([
      otp.verify(user.token, user.csrf, value.challengeId, value.developmentCode!, request),
      otp.verify(user.token, user.csrf, value.challengeId, value.developmentCode!, request),
    ]);
    expect(verifies.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await alterChallenge(user.id, { status: 'PROVIDER_APPROVED' });
    await otp.verify(user.token, user.csrf, value.challengeId, value.developmentCode!, request);
    expect(
      await connection
        .collection('audit_logs')
        .countDocuments({ event: 'AUTH_PHONE_VERIFIED', userId: user.id }),
    ).toBe(1);
  });
  it('keeps the previous challenge on provider failure and invalidates it after successful resend', async () => {
    const user = await fixture();
    const old = await otp.start(user.token, user.csrf, request);
    await alterChallenge(user.id, { resendAvailableAt: Date.now() - 1 });
    const failure = vi
      .spyOn(FakeOtpProvider.prototype, 'send')
      .mockRejectedValueOnce(new Error('provider failure'));
    await expect(otp.start(user.token, user.csrf, request)).rejects.toMatchObject({
      code: 'OTP_PROVIDER_UNAVAILABLE',
    });
    expect((await store.read(user.id.toHexString()))?.challengeId).toBe(old.challengeId);
    failure.mockRestore();
    const next = await otp.start(user.token, user.csrf, request);
    expect(next.challengeId).not.toBe(old.challengeId);
    await expect(
      otp.verify(user.token, user.csrf, old.challengeId, old.developmentCode!, request),
    ).rejects.toMatchObject({ code: 'OTP_CHALLENGE_NOT_FOUND' });
  });
  it('allows duplicate unverified phones but only one concurrent verification', async () => {
    const one = await fixture();
    const two = await fixture();
    const a = await otp.start(one.token, one.csrf, request);
    const b = await otp.start(two.token, two.csrf, request);
    const result = await Promise.allSettled([
      otp.verify(one.token, one.csrf, a.challengeId, a.developmentCode!, request),
      otp.verify(two.token, two.csrf, b.challengeId, b.developmentCode!, request),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.find((item) => item.status === 'rejected')).toMatchObject({
      reason: { code: 'PHONE_ALREADY_IN_USE' },
    });
  });
  it('checks all rate buckets without partial increments and fails closed on Redis outage', async () => {
    await store.consume([{ key: 'full', maximum: 1, seconds: 60 }]);
    await expect(
      store.consume([
        { key: 'unused', maximum: 1, seconds: 60 },
        { key: 'full', maximum: 1, seconds: 60 },
      ]),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(await redis.get(`${database}:otp:rate:unused`)).toBeNull();
    const disconnected = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    disconnected.disconnect();
    const unavailable = new ChallengeStore(disconnected, config);
    await expect(
      unavailable.consume([{ key: 'test', maximum: 1, seconds: 60 }]),
    ).rejects.toMatchObject({ code: 'OTP_PROVIDER_UNAVAILABLE' });
    await expect(unavailable.locked('test', () => Promise.resolve(true))).rejects.toMatchObject({
      code: 'OTP_PROVIDER_UNAVAILABLE',
    });
  });
  it('serializes admin changes, rejects escalation and reflects role changes in existing sessions', async () => {
    const one = await fixture('+84901234567', true);
    const two = await fixture('+84901234568', true);
    await expect(
      roles.change({ userId: one.id, role: 'MEMBER', operation: 'bootstrap', reason: 'TEST-1' }),
    ).rejects.toMatchObject({ code: 'ROLE_OPERATION_FORBIDDEN' });
    await roles.change({ userId: one.id, role: 'ADMIN', operation: 'bootstrap', reason: 'TEST-1' });
    await expect(
      roles.change({
        userId: two.id,
        actorId: two.id,
        role: 'ADMIN',
        operation: 'grant',
        reason: 'TEST-2',
      }),
    ).rejects.toMatchObject({ code: 'ROLE_OPERATION_FORBIDDEN' });
    await expect(
      repository.updatePhone(
        one.id,
        crypto.encrypt('+84901234569', `user:${one.id.toHexString()}:phone`),
        crypto.lookupHash('+84901234569'),
      ),
    ).rejects.toMatchObject({ code: 'ROLE_LAST_ADMIN' });
    await roles.change({
      userId: two.id,
      actorId: one.id,
      role: 'ADMIN',
      operation: 'grant',
      reason: 'TEST-3',
    });
    const currentSession = await auth.getSession(two.token);
    expect(currentSession.authenticated && currentSession.user.roles.includes('ADMIN')).toBe(true);
    const authorization = new AuthorizationService(auth);
    await expect(authorization.require(two.token, { allOf: ['MODERATOR'] })).resolves.toBeDefined();
    const changes = await Promise.allSettled([
      roles.change({
        userId: one.id,
        actorId: one.id,
        role: 'ADMIN',
        operation: 'revoke',
        reason: 'TEST-4',
      }),
      roles.change({
        userId: two.id,
        actorId: two.id,
        role: 'ADMIN',
        operation: 'revoke',
        reason: 'TEST-5',
      }),
    ]);
    expect(changes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(
      await connection
        .collection('users')
        .countDocuments({ roles: 'ADMIN', phoneStatus: 'VERIFIED' }),
    ).toBe(1);
  });
  it('makes elevated grants dormant on phone change and restores them after verification', async () => {
    const admin = await fixture('+84901234567', true);
    const member = await fixture('+84901234568', true);
    await roles.change({
      userId: admin.id,
      role: 'ADMIN',
      operation: 'bootstrap',
      reason: 'TEST-1',
    });
    await roles.change({
      userId: member.id,
      actorId: admin.id,
      role: 'MODERATOR',
      operation: 'grant',
      reason: 'TEST-2',
    });
    await repository.updatePhone(
      member.id,
      crypto.encrypt('+84901234569', `user:${member.id.toHexString()}:phone`),
      crypto.lookupHash('+84901234569'),
    );
    expect(await auth.getSession(member.token)).toMatchObject({ user: { roles: ['MEMBER'] } });
    const challenge = await otp.start(member.token, member.csrf, request);
    await otp.verify(
      member.token,
      member.csrf,
      challenge.challengeId,
      challenge.developmentCode!,
      request,
    );
    const currentSession = await auth.getSession(member.token);
    expect(currentSession.authenticated && currentSession.user.roles.includes('MODERATOR')).toBe(
      true,
    );
  });
});
