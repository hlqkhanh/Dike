import { connectForCli } from './connection.js';
import { MigrationRunner } from './migrations.js';

const action = process.argv[2];
const connection = await connectForCli();
try {
  const runner = new MigrationRunner(connection);
  if (action === 'up') await runner.up();
  else if (action === 'status')
    process.stdout.write(`${JSON.stringify(await runner.status(), null, 2)}\n`);
  else throw new Error('Expected migration action: up or status');
} finally {
  await connection.close();
}
