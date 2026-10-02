import { assertNonProduction } from '@dike/config';

import { loadApiConfig } from '../config/api-config.js';
import { connectForCli } from './connection.js';

const config = loadApiConfig();
assertNonProduction(config.APP_ENV, 'Database seed');
const connection = await connectForCli();
try {
  await connection.collection('_seeds').updateOne(
    { key: 'foundation-v1' },
    {
      $setOnInsert: {
        key: 'foundation-v1',
        version: 1,
        description: 'Synthetic Stage 1 foundation seed marker',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      },
    },
    { upsert: true },
  );
  process.stdout.write('[seed] Foundation seed is present.\n');
} finally {
  await connection.close();
}
