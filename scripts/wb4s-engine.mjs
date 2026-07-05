import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  WB4S_REPO,
  WB4S_SYNC_EXCLUDE_DIRS,
  WB4S_UPSTREAM_VERSION,
  getWb4sCacheSrc,
  getWb4sLocalUpdatePackage,
  getWb4sOverlayDir,
  getWb4sSiblingSrc,
  getWb4sVendorRoot,
} from './wb4s-upstream.mjs';

/**
 * @param {string} cwd
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean, stdio?: 'inherit' | 'pipe' }} [options]
 */
export function runCommand(cwd, command, args, { shell = false, stdio = 'inherit' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, stdio });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
}

export async function pathExists(target) {
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

export async function copyDir(src, dest, { excludeDirs = [] } = {}) {
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

async function syncFromDirectory(root, sourceDir, label) {
  const engineRoot = getWb4sCacheSrc(root);
  console.log(`[wb4s-engine] syncing from ${label} → ${engineRoot}`);
  await fs.rm(engineRoot, { recursive: true, force: true });
  await copyDir(sourceDir, engineRoot, { excludeDirs: [...WB4S_SYNC_EXCLUDE_DIRS] });
}

async function cloneUpstream(root) {
  const engineRoot = getWb4sCacheSrc(root);
  console.log(`[wb4s-engine] cloning ${WB4S_REPO} (v${WB4S_UPSTREAM_VERSION}) …`);
  await fs.mkdir(path.dirname(engineRoot), { recursive: true });
  await fs.rm(engineRoot, { recursive: true, force: true });
  await runCommand(root, 'git', ['clone', '--depth', '1', WB4S_REPO, engineRoot]);
}

async function migrateLegacyVendorCopy(root) {
  const vendorRoot = getWb4sVendorRoot(root);
  if (!(await pathExists(path.join(vendorRoot, 'package.json')))) return false;
  await syncFromDirectory(root, vendorRoot, 'legacy vendor/whiteboard4share');
  return true;
}

/**
 * @param {string} root
 * @param {{ strategy?: 'auto' | 'git' | 'local-package', force?: boolean }} [options]
 * @returns {Promise<'git-clone' | 'local-package' | 'sibling' | 'legacy-vendor' | 'cache'>}
 */
export async function syncWb4sEngine(root, { strategy = 'auto', force = false } = {}) {
  const engineRoot = getWb4sCacheSrc(root);
  const currentVersion = await readPackageVersion(engineRoot);

  if (!force && currentVersion === WB4S_UPSTREAM_VERSION) {
    await applyEducoworkOverlay(root);
    await ensureWb4sDependencies(root);
    return 'cache';
  }

  if (currentVersion && currentVersion !== WB4S_UPSTREAM_VERSION) {
    console.log(`[wb4s-engine] upgrading ${currentVersion} → ${WB4S_UPSTREAM_VERSION} …`);
  }

  if (strategy === 'local-package') {
    const localPackage = getWb4sLocalUpdatePackage(root);
    if (!(await pathExists(path.join(localPackage, 'package.json')))) {
      throw new Error(`로컬 업데이트 패키지 없음: ${localPackage}`);
    }
    await syncFromDirectory(root, localPackage, localPackage);
    await applyEducoworkOverlay(root);
    await ensureWb4sDependencies(root);
    return 'local-package';
  }

  const siblingSrc = getWb4sSiblingSrc(root);
  if (
    (strategy === 'auto' || strategy === 'git')
    && (await pathExists(path.join(siblingSrc, 'package.json')))
  ) {
    const siblingVersion = await readPackageVersion(siblingSrc);
    if (siblingVersion === WB4S_UPSTREAM_VERSION) {
      await syncFromDirectory(root, siblingSrc, siblingSrc);
      await applyEducoworkOverlay(root);
      await ensureWb4sDependencies(root);
      return 'sibling';
    }
    console.warn(
      `[wb4s-engine] sibling version is ${siblingVersion ?? 'unknown'}, expected ${WB4S_UPSTREAM_VERSION}`,
    );
  }

  if (strategy === 'auto' && (await migrateLegacyVendorCopy(root))) {
    await applyEducoworkOverlay(root);
    await ensureWb4sDependencies(root);
    return 'legacy-vendor';
  }

  if (strategy === 'auto' || strategy === 'git') {
    try {
      await cloneUpstream(root);
      await applyEducoworkOverlay(root);
      await ensureWb4sDependencies(root);
      return 'git-clone';
    } catch (error) {
      const localPackage = getWb4sLocalUpdatePackage(root);
      if (await pathExists(path.join(localPackage, 'package.json'))) {
        console.warn('[wb4s-engine] git clone failed — using lib/updates/wb4s');
        return syncWb4sEngine(root, { strategy: 'local-package', force: true });
      }
      throw error;
    }
  }

  throw new Error('WhiteBoard4Share engine sync failed');
}

export async function applyEducoworkOverlay(root) {
  const overlayDir = getWb4sOverlayDir(root);
  const engineRoot = getWb4sCacheSrc(root);

  if (!(await pathExists(overlayDir))) {
    console.warn('[wb4s-engine] overlay not found, skipping');
    return;
  }

  console.log('[wb4s-engine] applying EduCowork overlay …');
  await copyDir(overlayDir, engineRoot);
}

export async function ensureWb4sDependencies(root) {
  const engineRoot = getWb4sCacheSrc(root);
  const pkgPath = path.join(engineRoot, 'package.json');
  const nodeModules = path.join(engineRoot, 'node_modules');
  const lockPath = path.join(engineRoot, 'package-lock.json');

  if (!(await pathExists(pkgPath))) {
    throw new Error(`WhiteBoard4Share engine missing at ${engineRoot}. Run npm run prepare:wb4s-src`);
  }

  if (!(await pathExists(nodeModules))) {
    console.log('[wb4s-engine] npm install …');
    await runCommand(engineRoot, 'npm', ['install'], { shell: process.platform === 'win32' });
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
    console.log('[wb4s-engine] npm install (package changed) …');
    await runCommand(engineRoot, 'npm', ['install'], { shell: process.platform === 'win32' });
  }
}

/**
 * @param {string} root
 */
export async function buildWb4sEditorBundle(root) {
  const engineRoot = getWb4sCacheSrc(root);
  const publicOut = path.join(root, 'public', 'wb4s-editor');

  await ensureWb4sDependencies(root);
  console.log('[wb4s-editor] vite build …');
  await runCommand(engineRoot, 'npm', ['run', 'build'], { shell: process.platform === 'win32' });

  const distDir = path.join(engineRoot, 'dist');
  await fs.rm(publicOut, { recursive: true, force: true });
  await fs.cp(distDir, publicOut, { recursive: true });
  console.log(`[wb4s-editor] published → ${publicOut}`);
}
