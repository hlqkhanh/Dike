import mongoose, { type Connection } from 'mongoose';

import { loadApiConfig } from '../config/api-config.js';

export async function connectForCli(): Promise<Connection> {
  const config = loadApiConfig();
  return mongoose
    .createConnection(config.MONGODB_URI, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5_000,
    })
    .asPromise();
}
