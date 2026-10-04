import { randomUUID } from 'node:crypto';

import mongoose, { type Connection, type Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthRepository } from '../src/auth/auth.repository.js';
import { CryptoService } from '../src/auth/crypto.service.js';
import type { VerifiedIdentity } from '../src/auth/auth.types.js';
import { loadApiConfig } from '../src/config/api-config.js';
import { TransactionManager } from '../src/database/transaction-manager.js';

const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

integration('authentication persistence integration', () => {
  let connection: Connection;
  let repository: AuthRepository;
  let transactions: TransactionManager;
  let crypto: CryptoService;
  const createdUsers: Types.ObjectId[] = [];

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    crypto = new CryptoService(loadApiConfig(process.env));
    repository = new AuthRepository(connection, crypto);
    transactions = new TransactionManager(connection);
  });

  afterAll(async () => {
    if (connection) {
      await Promise.all([
        connection.collection('auth_identities').deleteMany({ userId: { $in: createdUsers } }),
        connection.collection('sessions').deleteMany({ userId: { $in: createdUsers } }),
        connection.collection('audit_logs').deleteMany({ userId: { $in: createdUsers } }),
        connection.collection('users').deleteMany({ _id: { $in: createdUsers } }),
      ]);
      await connection.close();
    }
  });

  it('keeps subject identity idempotent, encrypts PII and refuses email-based merging', async () => {
    const suffix = randomUUID();
    const email = `integration-${suffix}@dike.invalid`;
    const identity: VerifiedIdentity = {
      subject: `integration-subject-${suffix}`,
      email,
      emailVerified: true,
      displayName: 'Integration Member',
      avatarUrl: null,
    };

    const first = await transactions.run((session) =>
      repository.resolveIdentity(identity, session),
    );
    createdUsers.push(first.user._id);
    const second = await transactions.run((session) =>
      repository.resolveIdentity({ ...identity, displayName: 'Updated Member' }, session),
    );

    expect(second.user._id.equals(first.user._id)).toBe(true);
    expect(
      await connection.collection('auth_identities').countDocuments({
        provider: 'GOOGLE',
        providerSubject: identity.subject,
      }),
    ).toBe(1);

    const stored = await connection.collection('auth_identities').findOne({
      provider: 'GOOGLE',
      providerSubject: identity.subject,
    });
    expect(JSON.stringify(stored)).not.toContain(email);
    expect(
      crypto.decrypt(stored?.email as never, `authIdentity:${String(stored?._id)}:email`),
    ).toBe(email);

    const usersBeforeConflict = await connection.collection('users').countDocuments();
    await expect(
      transactions.run((session) =>
        repository.resolveIdentity(
          { ...identity, subject: `different-subject-${suffix}` },
          session,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LINK_REVIEW_REQUIRED' });
    expect(await connection.collection('users').countDocuments()).toBe(usersBeforeConflict);
    expect(
      await connection.collection('auth_identities').countDocuments({
        providerSubject: `different-subject-${suffix}`,
      }),
    ).toBe(0);

    const normalizedPhone = '+84901234567';
    const encryptedPhone = crypto.encrypt(
      normalizedPhone,
      `user:${first.user._id.toHexString()}:phone`,
    );
    const updated = await repository.updatePhone(
      first.user._id,
      encryptedPhone,
      crypto.lookupHash(normalizedPhone),
    );
    expect(updated?.phoneStatus).toBe('UNVERIFIED');
    expect(JSON.stringify(updated)).not.toContain(normalizedPhone);
    expect(
      crypto.decrypt(updated?.phone as never, `user:${first.user._id.toHexString()}:phone`),
    ).toBe(normalizedPhone);
  });
});
