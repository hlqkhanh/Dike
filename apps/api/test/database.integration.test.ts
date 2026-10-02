import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MigrationRunner } from '../src/database/migrations.js';
import { OutboxRepository } from '../src/outbox/outbox.repository.js';

const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

integration('MongoDB foundation integration', () => {
  let connection: Connection;

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  });

  afterAll(async () => connection?.close());

  it('commits and rolls back real replica-set transactions', async () => {
    const collection = connection.collection('transaction_test');
    await collection.deleteMany({});
    const committed = await connection.startSession();
    await committed.withTransaction(async () => {
      await collection.insertMany([{ key: 'one' }, { key: 'two' }], { session: committed });
    });
    await committed.endSession();
    expect(await collection.countDocuments()).toBe(2);

    const rolledBack = await connection.startSession();
    await expect(
      rolledBack.withTransaction(async () => {
        await collection.insertOne({ key: 'rollback' }, { session: rolledBack });
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');
    await rolledBack.endSession();
    expect(await collection.countDocuments({ key: 'rollback' })).toBe(0);
  });

  it('runs migrations idempotently', async () => {
    const runner = new MigrationRunner(connection);
    await runner.up();
    await runner.up();
    expect((await runner.status()).every((item) => item.applied && item.checksumMatches)).toBe(
      true,
    );
  });

  it('commits and rolls back aggregate plus outbox atomically', async () => {
    const outbox = new OutboxRepository(connection);
    const aggregates = connection.collection('foundation_aggregates');
    await Promise.all([
      aggregates.deleteMany({}),
      connection.collection('outbox_events').deleteMany({}),
    ]);

    const committed = await connection.startSession();
    await committed.withTransaction(async () => {
      await aggregates.insertOne({ key: 'committed' }, { session: committed });
      await outbox.append(
        {
          type: 'foundation.sample.requested.v1',
          aggregateType: 'foundation',
          aggregateId: 'committed',
          payload: {
            requestedAt: '2026-10-02T00:00:00.000Z',
            message: 'committed effect',
          },
        },
        committed,
      );
    });
    await committed.endSession();
    expect(await aggregates.countDocuments({ key: 'committed' })).toBe(1);
    expect(await connection.collection('outbox_events').countDocuments()).toBe(1);

    const rolledBack = await connection.startSession();
    await expect(
      rolledBack.withTransaction(async () => {
        await aggregates.insertOne({ key: 'rolled-back' }, { session: rolledBack });
        await outbox.append(
          {
            type: 'foundation.sample.requested.v1',
            aggregateType: 'foundation',
            aggregateId: 'rolled-back',
            payload: { message: 'must not persist' },
          },
          rolledBack,
        );
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');
    await rolledBack.endSession();
    expect(await aggregates.countDocuments({ key: 'rolled-back' })).toBe(0);
    expect(await connection.collection('outbox_events').countDocuments()).toBe(1);
  });
});
