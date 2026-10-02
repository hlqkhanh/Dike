import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('src/schema.ts');
const before = readFileSync(output, 'utf8');
await import('./generate.mjs');
const after = readFileSync(output, 'utf8');
if (before !== after) {
  throw new Error('Generated API client was stale. Commit the output of `pnpm api:generate`.');
}
