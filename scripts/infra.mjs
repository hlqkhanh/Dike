import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { ensureLocalEnvironment, rootDirectory } from './local-env.mjs';

const action = process.argv[2];
const composeFile = resolve(rootDirectory, 'infra', 'docker', 'compose.yml');
const environmentFile = ensureLocalEnvironment();
const base = [
  'compose',
  '--project-name',
  'dike-local',
  '--env-file',
  environmentFile,
  '--file',
  composeFile,
];

const commands = {
  up: [...base, 'up', '--detach', '--wait'],
  down: [...base, 'down'],
  logs: [...base, 'logs', '--follow', '--tail', '200'],
  reset: [...base, 'down', '--volumes', '--remove-orphans'],
};

if (!(action in commands)) {
  console.error('[infra] Expected one of: up, down, logs, reset.');
  process.exit(2);
}

if (action === 'reset' && !process.argv.includes('--confirm')) {
  console.error('[infra] Refusing to remove Dike local volumes without --confirm.');
  process.exit(2);
}

if (!composeFile.startsWith(rootDirectory) || !environmentFile.startsWith(rootDirectory)) {
  throw new Error('Resolved infrastructure paths escaped the repository root.');
}

const result = spawnSync('docker', commands[action], { cwd: rootDirectory, stdio: 'inherit' });
if (result.error) {
  console.error(`[infra] Docker failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
