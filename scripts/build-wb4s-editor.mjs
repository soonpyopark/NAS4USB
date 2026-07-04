import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wb4sSrc = path.join(root, '.cache', 'wb4s-src');
const overlayDir = path.join(root, 'vendor', 'wb4s-educowork-overlay');
const siblingSrc = path.resolve(root, '..', 'WhiteBoard4Share v1.0.2');
const publicOut = path.join(root, 'public', 'wb4s-editor');
const WB4S_REPO = 'https://github.com/soonpyopark/WhiteBoard4Share.git';

/** @type {readonly string[]} */
const SYNC_EXCLUDE_DIRS = ['node_modules', 'dist', 'exe', '.git', 'electron-dist', 'electron'];

function run(cwd, command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest, { excludeDirs = [] } = {}) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, { excludeDirs });
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function syncFromSibling() {
  console.log(`[wb4s-editor] syncing source from ${siblingSrc} …`);
  await fs.rm(wb4sSrc, { recursive: true, force: true });
  await copyDir(siblingSrc, wb4sSrc, { excludeDirs: [...SYNC_EXCLUDE_DIRS] });
}

async function cloneUpstream() {
  console.log(`[wb4s-editor] cloning ${WB4S_REPO} …`);
  await fs.mkdir(path.dirname(wb4sSrc), { recursive: true });
  await run(root, 'git', ['clone', '--depth', '1', WB4S_REPO, wb4sSrc]);
}

async function ensureWb4sSource() {
  if (await pathExists(path.join(wb4sSrc, 'package.json'))) {
    return;
  }

  if (await pathExists(path.join(siblingSrc, 'package.json'))) {
    await syncFromSibling();
    return;
  }

  await cloneUpstream();
}

async function applyEducoworkOverlay() {
  if (!(await pathExists(overlayDir))) {
    console.warn('[wb4s-editor] overlay not found, skipping');
    return;
  }

  console.log('[wb4s-editor] applying EduCowork overlay …');
  await copyDir(overlayDir, wb4sSrc);
}

async function publishDist() {
  const distDir = path.join(wb4sSrc, 'dist');
  await fs.rm(publicOut, { recursive: true, force: true });
  await fs.cp(distDir, publicOut, { recursive: true });
  console.log(`[wb4s-editor] published → ${publicOut}`);
}

async function main() {
  await ensureWb4sSource();
  await applyEducoworkOverlay();

  console.log('[wb4s-editor] npm install …');
  await run(wb4sSrc, 'npm', ['install'], { shell: process.platform === 'win32' });

  console.log('[wb4s-editor] vite build (embed bundle) …');
  await run(wb4sSrc, 'npm', ['run', 'build'], { shell: process.platform === 'win32' });

  await publishDist();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
