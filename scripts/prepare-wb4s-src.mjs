import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  WB4S_REPO,
  WB4S_SYNC_EXCLUDE_DIRS,
  WB4S_UPSTREAM_VERSION,
  getWb4sCacheSrc,
  getWb4sSiblingSrc,
} from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wb4sSrc = getWb4sCacheSrc(root);
const overlayDir = path.join(root, 'vendor', 'wb4s-educowork-overlay');
const siblingSrc = getWb4sSiblingSrc(root);

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

async function readPackageVersion(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, 'package.json'), 'utf8');
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
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
  console.log(`[wb4s-src] syncing source from ${siblingSrc} …`);
  await fs.rm(wb4sSrc, { recursive: true, force: true });
  await copyDir(siblingSrc, wb4sSrc, { excludeDirs: [...WB4S_SYNC_EXCLUDE_DIRS] });
}

async function cloneUpstream() {
  console.log(`[wb4s-src] cloning ${WB4S_REPO} (v${WB4S_UPSTREAM_VERSION}) …`);
  await fs.mkdir(path.dirname(wb4sSrc), { recursive: true });
  await fs.rm(wb4sSrc, { recursive: true, force: true });
  await run(root, 'git', ['clone', '--depth', '1', WB4S_REPO, wb4sSrc]);
}

async function ensureWb4sSource() {
  const currentVersion = await readPackageVersion(wb4sSrc);
  if (currentVersion === WB4S_UPSTREAM_VERSION) {
    return;
  }

  if (currentVersion && currentVersion !== WB4S_UPSTREAM_VERSION) {
    console.log(
      `[wb4s-src] upgrading ${currentVersion} → ${WB4S_UPSTREAM_VERSION} …`,
    );
  }

  if (await pathExists(path.join(siblingSrc, 'package.json'))) {
    const siblingVersion = await readPackageVersion(siblingSrc);
    if (siblingVersion === WB4S_UPSTREAM_VERSION) {
      await syncFromSibling();
      return;
    }
    console.warn(
      `[wb4s-src] sibling version is ${siblingVersion ?? 'unknown'}, expected ${WB4S_UPSTREAM_VERSION}; cloning from GitHub …`,
    );
  }

  await cloneUpstream();
}

async function applyEducoworkOverlay() {
  if (!(await pathExists(overlayDir))) {
    console.warn('[wb4s-src] overlay not found, skipping');
    return;
  }

  console.log('[wb4s-src] applying EduCowork overlay …');
  await copyDir(overlayDir, wb4sSrc);
}

async function ensureDependencies() {
  const pkgPath = path.join(wb4sSrc, 'package.json');
  const nodeModules = path.join(wb4sSrc, 'node_modules');
  const lockPath = path.join(wb4sSrc, 'package-lock.json');

  if (!(await pathExists(nodeModules))) {
    console.log('[wb4s-src] npm install …');
    await run(wb4sSrc, 'npm', ['install'], { shell: process.platform === 'win32' });
    return;
  }

  const [pkgStat, lockStat, nodeStat] = await Promise.all([
    fs.stat(pkgPath),
    pathExists(lockPath).then((ok) => (ok ? fs.stat(lockPath) : null)),
    fs.stat(nodeModules),
  ]);

  const pkgNewer = pkgStat.mtimeMs > nodeStat.mtimeMs;
  const lockNewer = lockStat && lockStat.mtimeMs > nodeStat.mtimeMs;
  if (pkgNewer || lockNewer) {
    console.log('[wb4s-src] npm install (package changed) …');
    await run(wb4sSrc, 'npm', ['install'], { shell: process.platform === 'win32' });
  }
}

async function main() {
  await ensureWb4sSource();
  await applyEducoworkOverlay();
  await ensureDependencies();
  console.log(`[wb4s-src] ready → ${wb4sSrc} (v${WB4S_UPSTREAM_VERSION})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
