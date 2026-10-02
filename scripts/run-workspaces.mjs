import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const task = process.argv[2];
const parallel = process.argv.includes('--parallel');

if (task === 'test:integration' && existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
  process.env.RUN_INTEGRATION = '1';
}

if (!task) {
  console.error('[workspace] Missing task name.');
  process.exit(2);
}

const manifests = [];
for (const root of ['apps', 'packages']) {
  if (!existsSync(root)) continue;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.scripts?.[task]) manifests.push(manifest.name ?? manifestPath);
  }
}

if (manifests.length === 0) {
  console.log(
    `[workspace] No package exposes "${task}" yet; this is expected until Stage 1 scaffolds the applications.`,
  );
  process.exit(0);
}

console.log(`[workspace] Running "${task}" in: ${manifests.join(', ')}`);
const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const args = ['pnpm', '-r'];
if (parallel) args.push('--parallel');
else args.push('--workspace-concurrency=1');
args.push('--if-present', 'run', task);
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[workspace] Failed to run "${task}": ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
