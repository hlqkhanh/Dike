import { Inject, Injectable } from '@nestjs/common';
import type { ClientSession, Connection } from 'mongoose';

import { MONGO_CONNECTION } from '../common/tokens.js';

@Injectable()
export class TransactionManager {
  constructor(@Inject(MONGO_CONNECTION) private readonly connection: Connection) {}

  async run<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      if (result === undefined) throw new Error('Transaction completed without a result');
      return result;
    } finally {
      await session.endSession();
    }
  }
}
