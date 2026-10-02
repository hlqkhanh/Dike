import { foundationSampleJobSchema } from '@dike/contracts';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Connection } from 'mongoose';

export function createSampleHandler(mongo: Connection) {
  return async (job: Job): Promise<{ alreadyProcessed: boolean }> => {
    const parsed = foundationSampleJobSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('Invalid foundation sample payload');

    const session = await mongo.startSession();
    try {
      let alreadyProcessed = false;
      await session.withTransaction(async () => {
        const existing = await mongo
          .collection('job_executions')
          .findOne({ eventId: parsed.data.eventId }, { session });
        if (existing) {
          alreadyProcessed = true;
          return;
        }
        await mongo.collection('job_executions').insertOne(
          {
            eventId: parsed.data.eventId,
            jobName: job.name,
            processedAt: new Date(),
          },
          { session },
        );
        await mongo.collection('foundation_effects').insertOne(
          {
            eventId: parsed.data.eventId,
            message: parsed.data.message,
            createdAt: new Date(),
          },
          { session },
        );
      });
      return { alreadyProcessed };
    } finally {
      await session.endSession();
    }
  };
}
