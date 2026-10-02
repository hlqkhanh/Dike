import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const spec = resolve('../../apps/api/openapi.json');
const output = resolve('src/schema.ts');
if (!existsSync(spec)) {
  throw new Error(
    `OpenAPI specification not found at ${spec}. Run the API OpenAPI generator first.`,
  );
}
execFileSync(
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
  ['pnpm', 'exec', 'openapi-typescript', spec, '--output', output],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
execFileSync(
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
  ['pnpm', 'exec', 'prettier', '--write', output],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
