import { randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import type { Connection } from 'mongoose';
import type { Logger } from 'pino';

interface ClaimedEvent {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  lockToken: string;
}

export class OutboxDispatcher {
  private stopped = false;

  constructor(
    private readonly mongo: Connection,
    private readonly queue: Queue,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number,
    private readonly attempts: number,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    while (!this.stopped) {
      const dispatched = await this.dispatchBatch(10);
      if (dispatched === 0) await this.delay(this.pollIntervalMs);
    }
  }

  async dispatchBatch(limit: number): Promise<number> {
    let count = 0;
    while (!this.stopped && count < limit) {
      const event = await this.claim();
      if (!event) break;
      try {
        await this.queue.add(
          event.type,
          { ...event.payload, eventId: event.eventId },
          {
            jobId: event.eventId,
            attempts: this.attempts,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        );
        await this.mongo.collection('outbox_events').updateOne(
          { eventId: event.eventId, lockToken: event.lockToken },
          {
            $set: { status: 'dispatched', processedAt: new Date() },
            $unset: { lockToken: '', lockedUntil: '' },
          },
        );
        count += 1;
      } catch (error) {
        const message = error instanceof Error ? error.name : 'UnknownError';
        this.logger.warn({ eventId: event.eventId, errorType: message }, 'outbox dispatch failed');
        await this.mongo.collection('outbox_events').updateOne(
          { eventId: event.eventId, lockToken: event.lockToken },
          {
            $set: {
              status: 'pending',
              availableAt: new Date(Date.now() + 5_000),
              lastError: message,
            },
            $unset: { lockToken: '', lockedUntil: '' },
          },
        );
      }
    }
    return count;
  }

  private async claim(): Promise<ClaimedEvent | null> {
    const now = new Date();
    const lockToken = randomUUID();
    const document = await this.mongo.collection('outbox_events').findOneAndUpdate(
      {
        status: { $in: ['pending', 'claimed'] },
        availableAt: { $lte: now },
        $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
      },
      {
        $set: { status: 'claimed', lockToken, lockedUntil: new Date(now.getTime() + 30_000) },
        $inc: { attempts: 1 },
      },
      { sort: { availableAt: 1 }, returnDocument: 'after' },
    );
    if (!document) return null;
    return {
      eventId: String(document.eventId),
      type: String(document.type),
      payload: document.payload as Record<string, unknown>,
      lockToken,
    };
  }

  private delay(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }
}
