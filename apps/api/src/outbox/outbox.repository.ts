import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ClientSession, Connection, Document } from 'mongoose';

import { MONGO_CONNECTION } from '../common/tokens.js';

export interface AppendOutboxEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface OutboxEventDocument extends Document {
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'claimed' | 'dispatched' | 'dead';
  attempts: number;
  availableAt: Date;
  lockedUntil?: Date;
  lockToken?: string;
  processedAt?: Date;
  lastError?: string;
}

@Injectable()
export class OutboxRepository {
  constructor(@Inject(MONGO_CONNECTION) private readonly connection: Connection) {}

  async append(input: AppendOutboxEvent, session: ClientSession): Promise<string> {
    const eventId = randomUUID();
    await this.connection.collection('outbox_events').insertOne(
      {
        eventId,
        ...input,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        createdAt: new Date(),
      },
      { session },
    );
    return eventId;
  }

  async claim(lockDurationMs = 30_000): Promise<OutboxEventDocument | null> {
    const now = new Date();
    const lockToken = randomUUID();
    return this.connection.collection<OutboxEventDocument>('outbox_events').findOneAndUpdate(
      {
        status: { $in: ['pending', 'claimed'] },
        availableAt: { $lte: now },
        $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
      },
      {
        $set: {
          status: 'claimed',
          lockToken,
          lockedUntil: new Date(now.getTime() + lockDurationMs),
        },
        $inc: { attempts: 1 },
      },
      { sort: { availableAt: 1 }, returnDocument: 'after' },
    );
  }
}
