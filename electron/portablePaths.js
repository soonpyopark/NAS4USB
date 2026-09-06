import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

/**
 * Present in USB/portable folder builds (optional marker).
 * State always lives next to the exe (Windows) or next to the .app (macOS
 * portable). MSI/app-bundle upgrades must never replace these runtime files.
 */
export const PORTABLE_MARKER = '.nas4usb-portable';

/** macOS Application Support folder when the .app is not in a portable folder. */
export const MAC_APP_SUPPORT_NAME = 'NAS4USB';

/** Workspace folders that older Mac builds created inside the .app bundle. */
export const MAC_BUNDLE_WORKSPACE_DIRS = [
  'share',
  'private',
  'data',
  '공유폴더',
  '개인폴더',
];

export const MAC_BUNDLE_EXTRA_FILES = ['.env'];

export const STATE_FILES = [
  '.nas4usb-settings.json',
  '.nas4usb-members.json',
  '.nas4usb-sessions.json',
  '.nas4usb-shares.json',
  '.nas4usb-file-access.json',
  '.nas4usb-favorites.json',
  '.nas4usb-folder-colors.json',
  '.nas4usb-folder-order.json',
  '.nas4usb-trash.json',
];

export const STATE_DIRS = ['.nas4usb'];

/** Chromium / Electron profile folder (Cache, GPUCache, Cookies, …). */
export const ELECTRON_PROFILE_DIR = path.join('.nas4usb', 'electron-profile');

/** Default Electron `userData` name under %APPDATA% (package.json `name`). */
export const LEGACY_USER_DATA_NAME = 'nas4usb';

/** Login sessions are machine-specific; do not migrate them. */
export const PC_SETTINGS_SKIP_FILES = ['.nas4usb-sessions.json'];

/** Document history lives here and can be huge — not PC settings. */
export const PC_SETTINGS_SKIP_DIR_CHILDREN = ['file-history', 'hwpx-history'];

/**
 * Walk `startDir` up until a `*.app` bundle is found.
 * @param {string} startDir
 * @returns {string}
 */
export function findEnclosingAppBundle(startDir) {
  let current = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (current.toLowerCase().endsWith('.app')) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

function pathExistsSync(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function hasPortableState(dir) {
  try {
    if (fs.existsSync(path.join(dir, PORTABLE_MARKER))) return true;
    for (const name of STATE_FILES) {
      if (fs.existsSync(path.join(dir, name))) return true;
    }
    for (const name of STATE_DIRS) {
      if (fs.existsSync(path.join(dir, name))) return true;
    }
    for (const name of MAC_BUNDLE_WORKSPACE_DIRS) {
      if (fs.existsSync(path.join(dir, name))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function macPersistentRoot() {
  try {
    return path.join(app.getPath('appData'), MAC_APP_SUPPORT_NAME);
  } catch {
    return '';
  }
}

/**
 * Windows: folder that contains NAS4USB.exe.
 * macOS portable: folder that contains NAS4USB.app (not Contents/MacOS).
 * macOS /Applications (or a lone .app): ~/Library/Application Support/NAS4USB.
 * @returns {string}
 */
function resolveMacExeRoot() {
  const execDir = path.dirname(process.execPath);
  const bundle = findEnclosingAppBundle(execDir);
  if (!bundle) return execDir;
  const besideApp = path.dirname(bundle);
  if (hasPortableState(besideApp)) return besideApp;
  return macPersistentRoot() || execDir;
}

/**
 * Folder that contains NAS4USB.exe (or the project root in dev).
 * Also the mutable state root (settings, members, default data/).
 * @param {boolean} isDev
 */
export function resolveExeRoot(isDev) {
  if (isDev) {
    return app.getAppPath();
  }
  if (process.platform === 'darwin') {
    return resolveMacExeRoot();
  }
  return path.dirname(process.execPath);
}

/**
 * Move a directory to `to`, or merge into `to` when it already exists.
 * @param {string} from
 * @param {string} to
 */
function migrateDirTreeSync(from, to) {
  if (!pathExistsSync(from)) return false;
  if (path.resolve(from) === path.resolve(to)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!pathExistsSync(to)) {
    fs.renameSync(from, to);
    return true;
  }
  fs.cpSync(from, to, { recursive: true, force: true });
  fs.rmSync(from, { recursive: true, force: true });
  return true;
}

/**
 * Older Mac builds stored settings/members/share inside Contents/MacOS.
 * Pull that live state out so replacing the .app no longer wipes it.
 *
 * @param {string} exeRoot
 * @returns {{ migrated: string[] }}
 */
export function migrateMacBundleStateToRoot(exeRoot) {
  if (process.platform !== 'darwin') return { migrated: [] };
  const bundle = findEnclosingAppBundle(path.dirname(process.execPath));
  if (!bundle) return { migrated: [] };
  const macosDir = path.join(bundle, 'Contents', 'MacOS');
  if (!pathExistsSync(macosDir)) return { migrated: [] };
  if (path.resolve(macosDir) === path.resolve(exeRoot)) {
    return { migrated: [] };
  }

  fs.mkdirSync(exeRoot, { recursive: true });
  /** @type {string[]} */
  const migrated = [];

  for (const name of [...STATE_FILES, ...MAC_BUNDLE_EXTRA_FILES]) {
    const from = path.join(macosDir, name);
    const to = path.join(exeRoot, name);
    if (!pathExistsSync(from)) continue;
    fs.copyFileSync(from, to);
    try {
      fs.unlinkSync(from);
    } catch {
      // bundle may be locked; the copy is enough
    }
    migrated.push(name);
  }

  for (const name of [...STATE_DIRS, ...MAC_BUNDLE_WORKSPACE_DIRS]) {
    const from = path.join(macosDir, name);
    const to = path.join(exeRoot, name);
    if (migrateDirTreeSync(from, to)) migrated.push(name);
  }

  if (migrated.length > 0) {
    console.log(`[state] moved out of app bundle → ${exeRoot} (${migrated.join(', ')})`);
  }
  return { migrated };
}

/**
 * @param {string} exeRoot
 */
export function isPortableLayout(exeRoot) {
  try {
    return fs.existsSync(path.join(exeRoot, PORTABLE_MARKER));
  } catch {
    return false;
  }
}

/**
 * Settings / members / shares live next to the executable (MSI install folder
 * or USB portable folder). MSI must not harvest these files.
 *
 * @param {boolean} isDev
 */
export function resolveStateRoot(isDev) {
  return resolveExeRoot(isDev);
}

/**
 * @param {boolean} isDev
 */
export function resolvePortableRoot(isDev) {
  return resolveStateRoot(isDev);
}

/**
 * Redirect Electron/Chromium `userData` next to the exe (or project root in
 * dev) so portable/MSI installs do not write %APPDATA%\nas4usb.
 * Must run before `app.requestSingleInstanceLock()` and `app.whenReady()`.
 *
 * @param {boolean} isDev
 */
export function applyPortableUserData(isDev) {
  const exeRoot = resolveExeRoot(isDev);
  if (!isDev && process.platform === 'darwin') {
    migrateMacBundleStateToRoot(exeRoot);
  }
  const userData = path.join(exeRoot, ELECTRON_PROFILE_DIR);
  app.setPath('userData', userData);
  return userData;
}

/** Previous Electron default: `%APPDATA%\nas4usb`. */
export function getLegacyUserDataPath() {
  try {
    return path.join(app.getPath('appData'), LEGACY_USER_DATA_NAME);
  } catch {
    return '';
  }
}

/**
 * @param {string} dir
 */
async function pathExists(dir) {
  try {
    await fsp.access(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time pull: if a previous build stored state in %APPDATA%\NAS4USB and the
 * install folder is missing those files, copy them back beside the exe.
 *
 * @param {string} exeRoot
 * @returns {Promise<{ migrated: string[] }>}
 */
export async function migrateUserDataStateToInstall(exeRoot) {
  /** @type {string[]} */
  const migrated = [];
  const userData = getLegacyUserDataPath();
  if (!userData) return { migrated };
  if (path.resolve(userData) === path.resolve(exeRoot)) {
    return { migrated };
  }
  if (!(await pathExists(userData))) {
    return { migrated };
  }

  for (const name of STATE_FILES) {
    const from = path.join(userData, name);
    const to = path.join(exeRoot, name);
    if (!(await pathExists(from)) || (await pathExists(to))) continue;
    await fsp.copyFile(from, to);
    migrated.push(name);
  }

  for (const name of STATE_DIRS) {
    const from = path.join(userData, name);
    const to = path.join(exeRoot, name);
    if (!(await pathExists(from)) || (await pathExists(to))) continue;
    await fsp.cp(from, to, { recursive: true });
    migrated.push(name);
  }

  if (migrated.length > 0) {
    console.log(`[state] restored from userData → install (${migrated.join(', ')})`);
  }
  return { migrated };
}
