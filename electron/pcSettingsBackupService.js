import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_VERSION } from '../shared/constants.js';
import {
  parsePcSettingsManifest,
  PC_SETTINGS_BACKUP_KIND,
  PC_SETTINGS_BACKUP_VERSION,
} from '../shared/pcSettingsBackup.js';
import { getPortableRoot } from './appContext.js';
import {
  PC_SETTINGS_SKIP_DIR_CHILDREN,
  PC_SETTINGS_SKIP_FILES,
  STATE_DIRS,
  STATE_FILES,
} from './portablePaths.js';
import { sevenZipMin } from './sevenZip.js';

const SETTINGS_FILE = '.nas4usb-settings.json';
const SKIP_FILES = new Set(PC_SETTINGS_SKIP_FILES);
const SKIP_DIR_CHILDREN = new Set(PC_SETTINGS_SKIP_DIR_CHILDREN);
const INCLUDE_FILES = STATE_FILES.filter((name) => !SKIP_FILES.has(name));

/**
 * @param {string} target
 */
async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {string} target
 */
function assertInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error('잘못된 백업 파일입니다.');
  }
}

/**
 * @param {string} dir
 */
async function makeTempDir(dir) {
  return fs.mkdtemp(path.join(os.tmpdir(), dir));
}

/**
 * @param {string} fromRoot
 * @param {string} toRoot
 * @param {string} dirName
 */
async function copyStateDir(fromRoot, toRoot, dirName) {
  const from = path.join(fromRoot, dirName);
  if (!(await pathExists(from))) return false;
  const to = path.join(toRoot, dirName);
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  let copied = false;
  for (const entry of entries) {
    if (SKIP_DIR_CHILDREN.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await fs.cp(src, dest, { recursive: true });
    } else {
      await fs.copyFile(src, dest);
    }
    copied = true;
  }
  return copied;
}

/**
 * @param {string} settingsPath
 */
async function readSettingsJson(settingsPath) {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Keep this PC's absolute paths after overwriting settings from another machine.
 * @param {object | null} incoming
 * @param {object | null} local
 */
function mergeLocalMachinePaths(incoming, local) {
  if (!incoming || !local) return incoming;
  const next = { ...incoming };
  if ('dataRoot' in local) next.dataRoot = local.dataRoot;
  if ('externalFolders' in local) next.externalFolders = local.externalFolders;
  if ('ffmpegPath' in local) next.ffmpegPath = local.ffmpegPath;
  const incomingBackup =
    incoming.workspaceBackup && typeof incoming.workspaceBackup === 'object'
      ? incoming.workspaceBackup
      : {};
  const localBackup =
    local.workspaceBackup && typeof local.workspaceBackup === 'object' ? local.workspaceBackup : {};
  if ('destPath' in localBackup || incoming.workspaceBackup) {
    next.workspaceBackup = {
      ...incomingBackup,
      destPath: 'destPath' in localBackup ? localBackup.destPath : incomingBackup.destPath,
    };
  }
  return next;
}

/**
 * @param {string} extractRoot
 */
async function resolveBundleRoot(extractRoot) {
  const direct = path.join(extractRoot, 'manifest.json');
  if (await pathExists(direct)) return extractRoot;
  const entries = await fs.readdir(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length === 1) {
    const nested = path.join(extractRoot, dirs[0].name);
    if (await pathExists(path.join(nested, 'manifest.json'))) return nested;
  }
  throw new Error('NAS4USB PC 설정 백업이 아닙니다.');
}

/**
 * @param {string} destZip
 */
export async function exportPcSettings(destZip) {
  const portableRoot = getPortableRoot();
  const dest = path.resolve(String(destZip ?? '').trim());
  if (!dest.toLowerCase().endsWith('.zip')) {
    throw new Error('설정 파일은 .zip 으로 저장해 주세요.');
  }

  const stageDir = await makeTempDir('nas4usb-pc-settings-export-');
  /** @type {string[]} */
  const packed = [];
  try {
    for (const name of INCLUDE_FILES) {
      const from = path.join(portableRoot, name);
      if (!(await pathExists(from))) continue;
      await fs.copyFile(from, path.join(stageDir, name));
      packed.push(name);
    }
    for (const name of STATE_DIRS) {
      if (await copyStateDir(portableRoot, stageDir, name)) {
        packed.push(name);
      }
    }
    if (packed.length === 0) {
      throw new Error('내보낼 PC 설정 파일이 없습니다.');
    }

    const settings = await readSettingsJson(path.join(portableRoot, SETTINGS_FILE));
    const manifest = {
      kind: PC_SETTINGS_BACKUP_KIND,
      version: PC_SETTINGS_BACKUP_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      files: packed,
      dataRoot: settings?.dataRoot ?? null,
      skipped: [...PC_SETTINGS_SKIP_FILES, ...PC_SETTINGS_SKIP_DIR_CHILDREN],
    };
    await fs.writeFile(path.join(stageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rm(dest, { force: true }).catch(() => {});
    const args = ['a', '-tzip', '-mx=1', dest];
    for (const name of await fs.readdir(stageDir)) {
      args.push(path.join(stageDir, name));
    }
    await sevenZipMin.cmd(args);

    const stat = await fs.stat(dest);
    return {
      filePath: dest,
      fileName: path.basename(dest),
      bytes: stat.size,
      files: packed,
    };
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {string} zipPath
 * @param {{ keepLocalPaths?: boolean }} [options]
 */
export async function importPcSettings(zipPath, options = {}) {
  const portableRoot = getPortableRoot();
  const source = path.resolve(String(zipPath ?? '').trim());
  if (!(await pathExists(source))) {
    throw new Error('설정 백업 파일을 찾을 수 없습니다.');
  }

  const extractDir = await makeTempDir('nas4usb-pc-settings-import-');
  const rollbackDir = await makeTempDir('nas4usb-pc-settings-rollback-');
  /** @type {string[]} */
  const restored = [];
  try {
    await sevenZipMin.unpack(source, extractDir);
    const bundleRoot = await resolveBundleRoot(extractDir);
    assertInside(extractDir, bundleRoot);

    const manifestRaw = JSON.parse(await fs.readFile(path.join(bundleRoot, 'manifest.json'), 'utf8'));
    const manifest = parsePcSettingsManifest(manifestRaw);
    if (!manifest) {
      throw new Error('NAS4USB PC 설정 백업이 아닙니다.');
    }

    const localSettings = await readSettingsJson(path.join(portableRoot, SETTINGS_FILE));

    for (const name of [...INCLUDE_FILES, ...STATE_DIRS]) {
      const current = path.join(portableRoot, name);
      if (!(await pathExists(current))) continue;
      const backupTo = path.join(rollbackDir, name);
      const stat = await fs.stat(current);
      if (stat.isDirectory()) {
        await fs.cp(current, backupTo, { recursive: true });
      } else {
        await fs.copyFile(current, backupTo);
      }
    }

    for (const name of INCLUDE_FILES) {
      const from = path.join(bundleRoot, name);
      assertInside(bundleRoot, from);
      if (!(await pathExists(from))) continue;
      const to = path.join(portableRoot, name);
      await fs.copyFile(from, to);
      restored.push(name);
    }

    for (const name of STATE_DIRS) {
      const from = path.join(bundleRoot, name);
      assertInside(bundleRoot, from);
      if (!(await pathExists(from))) continue;
      const to = path.join(portableRoot, name);
      await fs.mkdir(to, { recursive: true });
      const entries = await fs.readdir(from, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP_DIR_CHILDREN.has(entry.name)) continue;
        const src = path.join(from, entry.name);
        const dest = path.join(to, entry.name);
        assertInside(from, src);
        if (entry.isDirectory()) {
          await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
          await fs.cp(src, dest, { recursive: true });
        } else {
          await fs.copyFile(src, dest);
        }
      }
      restored.push(name);
    }

    if (restored.length === 0) {
      throw new Error('백업에 적용할 설정 파일이 없습니다.');
    }

    if (options.keepLocalPaths) {
      const incoming = await readSettingsJson(path.join(portableRoot, SETTINGS_FILE));
      const merged = mergeLocalMachinePaths(incoming, localSettings);
      if (merged) {
        await fs.writeFile(
          path.join(portableRoot, SETTINGS_FILE),
          `${JSON.stringify(merged, null, 2)}\n`,
          'utf8',
        );
      }
    }

    return {
      files: restored,
      keepLocalPaths: Boolean(options.keepLocalPaths),
      exportedDataRoot: manifest.dataRoot ?? null,
    };
  } catch (error) {
    for (const name of [...INCLUDE_FILES, ...STATE_DIRS]) {
      const backupFrom = path.join(rollbackDir, name);
      if (!(await pathExists(backupFrom))) continue;
      const dest = path.join(portableRoot, name);
      const stat = await fs.stat(backupFrom);
      if (stat.isDirectory()) {
        await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
        await fs.cp(backupFrom, dest, { recursive: true });
      } else {
        await fs.copyFile(backupFrom, dest);
      }
    }
    throw error;
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(rollbackDir, { recursive: true, force: true }).catch(() => {});
  }
}
