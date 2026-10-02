import { randomUUID } from 'node:crypto';

import { FOUNDATION_QUEUE } from '@dike/contracts';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSampleHandler } from '../src/sample-handler.js';

const integration = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

integration('BullMQ foundation integration', () => {
  let mongo: Connection;
  let queueConnection: Redis;
  let workerConnection: Redis;
  let eventsConnection: Redis;
  let queue: Queue;
  let events: QueueEvents;
  let worker: Worker;

  beforeAll(async () => {
    if (!process.env.MONGODB_URI || !process.env.REDIS_URL) {
      throw new Error('MONGODB_URI and REDIS_URL are required');
    }
    mongo = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    queueConnection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    workerConnection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    eventsConnection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(FOUNDATION_QUEUE, { connection: queueConnection });
    events = new QueueEvents(FOUNDATION_QUEUE, { connection: eventsConnection });
    await Promise.all([queue.drain(true), events.waitUntilReady()]);
    worker = new Worker(FOUNDATION_QUEUE, createSampleHandler(mongo), {
      connection: workerConnection,
      concurrency: 1,
    });
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await Promise.allSettled([
      worker?.close(),
      events?.close(),
      queue?.close(),
      mongo?.close(),
      queueConnection?.quit(),
      workerConnection?.quit(),
      eventsConnection?.quit(),
    ]);
  });

  it('processes a duplicate event exactly once', async () => {
    const eventId = randomUUID();
    await Promise.all([
      mongo.collection('job_executions').deleteMany({ eventId }),
      mongo.collection('foundation_effects').deleteMany({ eventId }),
    ]);
    const data = { eventId, requestedAt: new Date().toISOString(), message: 'one effect' };
    const first = await queue.add('foundation.sample.requested.v1', data, { jobId: eventId });
    await first.waitUntilFinished(events, 10_000);
    const duplicate = await queue.add('foundation.sample.requested.v1', data, {
      jobId: `${eventId}-duplicate`,
    });
    expect(await duplicate.waitUntilFinished(events, 10_000)).toEqual({ alreadyProcessed: true });
    expect(await mongo.collection('foundation_effects').countDocuments({ eventId })).toBe(1);
  });

  it('does not retry an invalid payload', async () => {
    const job = await queue.add(
      'foundation.sample.requested.v1',
      { eventId: 'invalid' },
      {
        jobId: randomUUID(),
        attempts: 3,
      },
    );
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toBeTruthy();
    const failed = await Job.fromId(queue, job.id ?? '');
    expect(failed?.attemptsMade).toBe(1);
    expect(failed?.failedReason).toBe('Invalid foundation sample payload');
  });
});
