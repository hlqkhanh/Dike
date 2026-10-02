import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { ensureLocalEnvironment, rootDirectory } from './local-env.mjs';

ensureLocalEnvironment();
const docker = spawnSync('docker', ['info'], { cwd: rootDirectory, stdio: 'ignore' });
if (docker.status !== 0) {
  console.error('[dev] Docker is unavailable. Start Docker Desktop/Engine and retry.');
  process.exit(1);
}

const infra = spawnSync(process.execPath, [resolve(import.meta.dirname, 'infra.mjs'), 'up'], {
  cwd: rootDirectory,
  stdio: 'inherit',
});
if (infra.status !== 0) process.exit(infra.status ?? 1);

const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const child = spawn(command, ['pnpm', 'dev:apps'], {
  cwd: rootDirectory,
  env: { ...process.env, COREPACK_HOME: resolve(rootDirectory, '.corepack') },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 1));
