import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateEditorCores } from '../electron/editorUpdater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  return {
    skipGit: argv.includes('--skip-git'),
    skipNpm: argv.includes('--skip-npm'),
    skipCores: argv.includes('--skip-cores'),
    build: argv.includes('--build'),
    force: argv.includes('--force'),
  };
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 */
function run(label, command, args) {
  console.log(`[update-all] ${label}…`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 1})`);
  }
}

async function clearForcedCaches() {
  const wb4sCache = path.join(root, '.cache', 'wb4s-src');
  try {
    await fs.rm(wb4sCache, { recursive: true, force: true });
    console.log('[update-all] cleared .cache/wb4s-src (force)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[update-all] could not clear wb4s cache: ${message}`);
  }
}

async function gitPull() {
  try {
    await fs.access(path.join(root, '.git'));
  } catch {
    console.log('[update-all] Not a git repo; skip git pull');
    return;
  }

  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.stdout?.trim()) {
    console.log('[update-all] Git working tree has local changes; skip git pull');
    return;
  }

  run('git pull', 'git', ['pull', '--ff-only']);
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 */
async function updateEditorStacks(opts) {
  if (opts.force) {
    await clearForcedCaches();
  }

  console.log('[update-all] Updating editor cores (rhwp, wb4s, fortune-sheet, tiptap, comic-reader)…');
  const result = await updateEditorCores(root);

  for (const item of result.results) {
    const tag = item.success ? 'OK' : 'FAIL';
    console.log(`[update-all]   ${item.id}: ${tag} — ${item.message}`);
  }

  if (!result.success && !result.partial) {
    throw new Error('All editor core updates failed');
  }

  run('build rhwp studio', 'npm', ['run', 'build:rhwp-studio']);
  run('prepare wb4s src', 'npm', ['run', 'prepare:wb4s-src']);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('[update-all] ===== started =====');
  console.log(`[update-all] Project root: ${root}`);

  run('stop dev server', 'node', ['scripts/dev-process.mjs', 'stop']);

  if (!opts.skipGit) {
    await gitPull();
  }

  if (!opts.skipNpm) {
    run('npm install', 'npm', ['install']);
    run('npm update', 'npm', ['update']);
  }

  if (!opts.skipCores) {
    await updateEditorStacks(opts);
  }

  run('prepare icons', 'npm', ['run', 'prepare:icons']);

  if (opts.build) {
    run('build dist exe', 'npm', ['run', 'build:dist:exe']);
  }

  console.log('[update-all] ===== finished =====');
}

main().catch((error) => {
  console.error('[update-all] ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
