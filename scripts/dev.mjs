import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { ensureLocalEnvironment, rootDirectory } from './local-env.mjs';

const environmentPath = ensureLocalEnvironment();
process.loadEnvFile(environmentPath);
if (process.argv.includes('--google')) process.env.AUTH_PROVIDER = 'google';
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
const migration = spawnSync(command, ['pnpm', 'db:migrate'], {
  cwd: rootDirectory,
  env: { ...process.env, COREPACK_HOME: resolve(rootDirectory, '.corepack') },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

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
