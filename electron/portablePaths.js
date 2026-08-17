import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

/**
 * Present in USB/portable folder builds (optional marker).
 * State always lives next to the exe for both MSI and portable — MSI simply
 * must never package these runtime files, so upgrades leave them alone.
 */
export const PORTABLE_MARKER = '.nas4usb-portable';

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

/** Login sessions are machine-specific; do not migrate them. */
export const PC_SETTINGS_SKIP_FILES = ['.nas4usb-sessions.json'];

/** Document history lives here and can be huge — not PC settings. */
export const PC_SETTINGS_SKIP_DIR_CHILDREN = ['file-history', 'hwpx-history'];

/**
 * Folder that contains NAS4USB.exe (or the project root in dev).
 * Also the mutable state root (settings, members, default data/).
 * @param {boolean} isDev
 */
export function resolveExeRoot(isDev) {
  if (isDev) {
    return app.getAppPath();
  }
  return path.dirname(process.execPath);
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
  let userData;
  try {
    userData = app.getPath('userData');
  } catch {
    return { migrated };
  }
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
