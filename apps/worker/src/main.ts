import { ObjectStorage } from '@dike/storage';
import { RetentionService } from './retention.js';
import { FOUNDATION_QUEUE } from '@dike/contracts';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';

import { loadWorkerConfig } from './config.js';
import { createWorkerLogger } from './logger.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { WorkflowStore } from '@dike/workflows';
import { createWorkflowHandler } from './workflow-handler.js';

const config = loadWorkerConfig();
const logger = createWorkerLogger(config);
const mongo = await mongoose
  .createConnection(config.MONGODB_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5_000,
  })
  .asPromise();
const queueConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(FOUNDATION_QUEUE, { connection: queueConnection });
const storage = new ObjectStorage(config.storage);
const workflows = new WorkflowStore(mongo, storage);
const worker = new Worker(FOUNDATION_QUEUE, createWorkflowHandler(mongo, workflows, config), {
  connection: workerConnection,
  concurrency: config.concurrency,
});
const dispatcher = new OutboxDispatcher(
  mongo,
  queue,
  logger,
  config.pollIntervalMs,
  config.attempts,
);

for (const connection of [queueConnection, workerConnection]) {
  connection.on('error', (error) => {
    logger.warn({ errorType: error.name }, 'redis connection error');
  });
}
queue.on('error', (error) => logger.warn({ errorType: error.name }, 'queue error'));
worker.on('error', (error) => logger.warn({ errorType: error.name }, 'worker error'));

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'));
worker.on('failed', (job, error) =>
  logger.warn({ jobId: job?.id, errorType: error.name }, 'job failed'),
);
void dispatcher.run().catch((error: unknown) => {
  logger.error(
    { errorType: error instanceof Error ? error.name : 'UnknownError' },
    'dispatcher stopped unexpectedly',
  );
  process.exitCode = 1;
});

const retention = new RetentionService(mongo, storage);
let retentionWork: Promise<void> | undefined;
const runRetention = () => {
  if (!config.retentionEnabled || retentionWork) return;
  retentionWork = (async () => {
    if (config.EKYC_PROVIDER === 'mock') await workflows.expire();
    await retention.sweep();
  })()
    .catch((error: unknown) =>
      logger.warn(
        { errorType: error instanceof Error ? error.name : 'UnknownError' },
        'retention sweep failed; will retry',
      ),
    )
    .finally(() => {
      retentionWork = undefined;
    });
};
const retentionTimer = setInterval(runRetention, 60000);
runRetention();
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  dispatcher.stop();
  clearInterval(retentionTimer);
  await retentionWork;
  storage.close();
  await worker.pause(true);
  await Promise.allSettled([
    worker.close(),
    queue.close(),
    mongo.close(),
    queueConnection.quit(),
    workerConnection.quit(),
  ]);
}

process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
