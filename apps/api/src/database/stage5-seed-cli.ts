import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ObjectStorage } from '@dike/storage';
import { WorkflowStore } from '@dike/workflows';
import { loadApiConfig } from '../config/api-config.js';
import { connectForCli } from './connection.js';
import { MigrationRunner } from './migrations.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { CryptoService } from '../auth/crypto.service.js';
import { TransactionManager } from './transaction-manager.js';
const config = loadApiConfig();
if (
  !['local', 'test'].includes(config.APP_ENV) ||
  config.AUTH_PROVIDER !== 'mock' ||
  config.EKYC_PROVIDER !== 'mock'
)
  throw new Error('Stage 5 seed requires local/test mock providers');
const mongo = await connectForCli();
const storage = new ObjectStorage(config);
try {
  await new MigrationRunner(mongo).up();
  const repository = new AuthRepository(mongo, new CryptoService(config));
  const ids = [];
  for (const [account, name, admin] of [
    ['stage5-admin-one', 'Sandbox Admin One', true],
    ['stage5-admin-two', 'Sandbox Admin Two', true],
    ['stage5-member', 'Sandbox Member', false],
  ] as const) {
    const id = await new TransactionManager(mongo).run(async (session) => {
      const marker = await mongo
        .collection('_seeds')
        .findOne({ key: `stage5:${account}` }, { session });
      // Re-running seed does not restore revoked roles or deleted accounts.
      if (marker) return String(marker.userId);
      const result = await repository.resolveIdentity(
        {
          subject: `mock-google-${account}`,
          email: `${account}@dike.invalid`,
          emailVerified: true,
          displayName: name,
          avatarUrl: null,
        },
        session,
      );
      await mongo.collection('users').updateOne(
        { _id: result.user._id },
        {
          $set: {
            phoneStatus: 'VERIFIED',
            roles: admin ? ['MEMBER', 'ADMIN'] : ['MEMBER'],
            identityStatus: 'NOT_SUBMITTED',
            identityMode: 'SANDBOX',
            approvedVehicleCount: 0,
          },
          $inc: { roleVersion: 1 },
        },
        { session },
      );
      await mongo.collection('audit_logs').insertOne(
        {
          event: 'LOCAL_SYNTHETIC_ACCOUNT_SEEDED',
          outcome: 'SUCCESS',
          userId: result.user._id,
          createdAt: new Date(),
        },
        { session },
      );
      await mongo
        .collection('_seeds')
        .insertOne(
          { key: `stage5:${account}`, userId: result.user._id, createdAt: new Date() },
          { session },
        );
      return String(result.user._id);
    });
    ids.push(id);
  }
  const { Types } = await import('mongoose');
  const store = new WorkflowStore(mongo, storage);
  if (!(await mongo.collection('communities').findOne({ slug: 'sandbox-school' })))
    await store.saveCommunity(new Types.ObjectId(ids[0]), undefined, {
      commandId: randomUUID(),
      expectedVersion: 0,
      slug: 'sandbox-school',
      name: 'Sandbox School',
      type: 'SCHOOL',
      description: 'Synthetic local community',
    });
  if (!(await mongo.collection('vehicles').findOne({ syntheticPlate: 'SYNTH-DEMO-001' })))
    await store.createVehicle(new Types.ObjectId(ids[2]), {
      commandId: randomUUID(),
      type: 'MOTORBIKE',
      model: 'Synthetic motorcycle',
      color: 'Blue',
      syntheticPlate: 'SYNTH-DEMO-001',
      passengerCapacity: 1,
    });
  process.stdout.write(
    '[seed] Stage 5 synthetic accounts/community/draft vehicle are present. Sign in through mock OIDC. Identity approval still requires the review workflow.',
  );
} finally {
  storage.close();
  await mongo.close();
}
