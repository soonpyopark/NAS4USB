import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { TRASH_FOLDER } from '../shared/constants.js';
import { getDataRoot, getExeRoot, getInstallRoot, getPortableRoot } from './appContext.js';
import { isDefaultDataRoot } from './envConfig.js';

/**
 * WiX MSI `<Files>` historically replaces Hangul (and other non-ASCII) path
 * segments with DEL (U+007F). Those names render as blank stems (`.hwpx` only).
 *
 * @param {string} name
 */
function hasCorruptNameChars(name) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(name);
}

/**
 * @param {string} dir
 */
async function pathExists(dir) {
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Packaged builds prefer seed inside `app.asar` (WiX cannot mangle inner paths).
 * Dev uses the repo `seed/data`. Loose `resources/seed` is a legacy fallback.
 *
 * @param {boolean} isDev
 * @returns {Promise<string | null>}
 */
export async function resolveSeedDataDir(isDev) {
  /** @type {string[]} */
  const candidates = [];

  if (isDev) {
    candidates.push(path.join(getInstallRoot(), 'seed', 'data'));
    candidates.push(path.join(getExeRoot(), 'seed', 'data'));
  } else {
    try {
      candidates.push(path.join(app.getAppPath(), 'seed', 'data'));
    } catch {
      // app may be unavailable in tests
    }
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'seed', 'data'));
    candidates.push(path.join(process.resourcesPath, 'seed', 'data'));
    candidates.push(path.join(getExeRoot(), 'seed', 'data'));
  }

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    if (await seedDirLooksCorrupt(candidate)) {
      console.warn(`[data] skipping corrupt seed source: ${candidate}`);
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * @param {string} seedDir
 */
async function seedDirLooksCorrupt(seedDir) {
  const names = await fs.readdir(seedDir).catch(() => []);
  return names.some((name) => hasCorruptNameChars(name));
}

/**
 * @param {string} dataRoot
 */
async function listUserFacingEntries(dataRoot) {
  const names = await fs.readdir(dataRoot).catch(() => []);
  return names.filter((name) => name !== TRASH_FOLDER && !name.startsWith('.'));
}

/**
 * Copy seed files one-by-one so paths inside `app.asar` work reliably.
 *
 * @param {string} seedDir
 * @param {string} dataRoot
 */
async function copySeedTree(seedDir, dataRoot) {
  const entries = await fs.readdir(seedDir, { withFileTypes: true });
  for (const entry of entries) {
    if (hasCorruptNameChars(entry.name)) {
      throw new Error(`corrupt seed entry: ${JSON.stringify(entry.name)}`);
    }
    const src = path.join(seedDir, entry.name);
    const dest = path.join(dataRoot, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      await copySeedTree(src, dest);
      continue;
    }
    const buf = await fs.readFile(src);
    await fs.writeFile(dest, buf);
  }
}

/**
 * Remove WiX-corrupted sample filenames. Seed UTF-8 samples only into the
 * default `{stateRoot}/share` when it is empty — never into a user-chosen
 * workspace root (that would hide their empty folder behind broken samples).
 *
 * @param {{ isDev: boolean, dataRoot?: string }} options
 */
export async function ensureSampleDataSeeded(options) {
  const dataRoot = options.dataRoot ?? getDataRoot();
  const stateRoot = getPortableRoot();
  await fs.mkdir(dataRoot, { recursive: true });

  for (const name of await listUserFacingEntries(dataRoot)) {
    if (!hasCorruptNameChars(name)) continue;
    await fs.rm(path.join(dataRoot, name), { recursive: true, force: true });
  }

  if (!isDefaultDataRoot(dataRoot, stateRoot)) {
    return { seeded: false, reason: 'custom-data-root' };
  }

  const remaining = await listUserFacingEntries(dataRoot);
  if (remaining.length > 0) return { seeded: false, reason: 'data-not-empty' };

  const seedDir = await resolveSeedDataDir(options.isDev);
  if (!seedDir) return { seeded: false, reason: 'no-seed-source' };

  await copySeedTree(seedDir, dataRoot);
  return { seeded: true, from: seedDir };
}
