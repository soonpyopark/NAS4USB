import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { normalizeFolderColorValue, pickRandomFolderColorKey } from '../shared/folderColors.js';
import { isFavoritesRelativePath, isTrashRelativePath } from '../shared/constants.js';
import { isFixedFolderOrderPath } from '../shared/folderOrder.js';
import { isHomesContainerPath, isMemberHomeRootPath } from '../shared/memberHomes.js';
import { isTiptapAssetSidecarRelativePath } from '../shared/tiptapAssetPaths.js';
import {
  normalizeFileCollapsedMap,
  normalizeFileIndent,
  normalizeFileLevelMap,
} from '../shared/fileIndent.js';

const FOLDER_COLORS_FILE = '.nas4usb-folder-colors.json';

/**
 * @typedef {{
 *   colors: Record<string, string>,
 *   bold: Record<string, true>,
 *   levels: Record<string, number>,
 *   collapsed: Record<string, true>,
 * }} FolderColorsStore
 */

/**
 * @param {string} portableRoot
 * @returns {Promise<FolderColorsStore>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, FOLDER_COLORS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.colors && typeof parsed.colors === 'object' && !Array.isArray(parsed.colors)) {
      return {
        colors: { ...parsed.colors },
        bold: normalizeBoldMap(parsed.bold),
        levels: normalizeFileLevelMap(parsed.levels),
        collapsed: normalizeFileCollapsedMap(parsed.collapsed),
      };
    }
  } catch {
    // fall through
  }
  return { colors: {}, bold: {}, levels: {}, collapsed: {} };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, true>}
 */
function normalizeBoldMap(raw) {
  /** @type {Record<string, true>} */
  const bold = {};
  if (!raw || typeof raw !== 'object') return bold;
  for (const [key, value] of Object.entries(raw)) {
    if (value) bold[String(key).replace(/\\/g, '/')] = true;
  }
  return bold;
}

/**
 * @param {string} portableRoot
 * @param {FolderColorsStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, FOLDER_COLORS_FILE);
  const colors =
    store?.colors && typeof store.colors === 'object' && !Array.isArray(store.colors)
      ? store.colors
      : {};
  const bold =
    store?.bold && typeof store.bold === 'object' && !Array.isArray(store.bold) ? store.bold : {};
  const levels = normalizeFileLevelMap(store?.levels);
  const collapsed = normalizeFileCollapsedMap(store?.collapsed);
  await fs.writeFile(filePath, JSON.stringify({ colors, bold, levels, collapsed }, null, 2), 'utf8');
}

/**
 * @param {string} [portableRoot]
 */
export async function getFolderColorsMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.colors;
}

/**
 * @param {string} [portableRoot]
 */
export async function getEntryBoldMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.bold;
}

/**
 * @param {string} [portableRoot]
 */
export async function getEntryLevelMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.levels;
}

/**
 * @param {string} [portableRoot]
 */
export async function getEntryCollapsedMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.collapsed;
}

/**
 * @param {string} relativePath
 */
function shouldAssignRandomFolderColor(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalized || normalized === '.') return false;
  if (isTrashRelativePath(normalized) || isFavoritesRelativePath(normalized)) return false;
  if (isFixedFolderOrderPath(normalized)) return false;
  if (isHomesContainerPath(normalized) || isMemberHomeRootPath(normalized)) return false;
  if (isTiptapAssetSidecarRelativePath(normalized)) return false;
  const base = normalized.split('/').pop() ?? '';
  if (!base || base.startsWith('.')) return false;
  return true;
}

/**
 * @param {Record<string, string>} colors
 * @param {string} relativePath
 */
function siblingColorValues(colors, relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const parent = slash === -1 ? '.' : normalized.slice(0, slash);
  const prefix = parent === '.' ? '' : `${parent}/`;
  /** @type {string[]} */
  const used = [];
  for (const [key, value] of Object.entries(colors)) {
    if (key === normalized) continue;
    if (prefix) {
      if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/')) continue;
    } else if (key.includes('/')) {
      continue;
    }
    if (value) used.push(value);
  }
  return used;
}

/**
 * Assign a random palette color to a newly created user folder.
 * Skips system/hidden paths and leaves an existing color unchanged.
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function assignRandomFolderColor(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!shouldAssignRandomFolderColor(normalizedPath)) return null;

  const store = await loadStore(portableRoot);
  const existing = normalizeFolderColorValue(store.colors[normalizedPath]);
  if (existing) return existing;

  const nextColor = pickRandomFolderColorKey(siblingColorValues(store.colors, normalizedPath));
  store.colors[normalizedPath] = nextColor;
  await saveStore(portableRoot, store);
  return nextColor;
}

/**
 * @param {string} relativePath
 * @param {string | null | undefined} color
 * @param {string} [portableRoot]
 */
export async function setFolderColor(relativePath, color, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('폴더 경로가 올바르지 않습니다.');
  }

  const stat = await fsService.statPath(normalizedPath);
  if (!stat.isDirectory) {
    throw new Error('폴더에만 색을 지정할 수 있습니다.');
  }

  const store = await loadStore(portableRoot);
  const nextColor = normalizeFolderColorValue(color);
  if (nextColor) store.colors[normalizedPath] = nextColor;
  else delete store.colors[normalizedPath];

  await saveStore(portableRoot, store);
  return { relativePath: normalizedPath, color: nextColor };
}

/**
 * Toggle bold file/folder names in the explorer. Works for files and folders.
 * @param {string} relativePath
 * @param {boolean} bold
 * @param {string} [portableRoot]
 */
export async function setEntryBold(relativePath, bold, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('경로가 올바르지 않습니다.');
  }

  await fsService.statPath(normalizedPath);

  const store = await loadStore(portableRoot);
  if (bold) store.bold[normalizedPath] = true;
  else delete store.bold[normalizedPath];

  await saveStore(portableRoot, store);
  return { relativePath: normalizedPath, bold: Boolean(bold) };
}

/**
 * @param {FolderColorsStore} store
 * @param {string} relativePath
 * @param {number} level
 */
function writeEntryLevel(store, relativePath, level) {
  const next = normalizeFileIndent(level);
  if (next > 0) store.levels[relativePath] = next;
  else delete store.levels[relativePath];
  return next;
}

/**
 * OneNote-style indent for files (0 = top-level sibling).
 * @param {string} relativePath
 * @param {number} level
 * @param {string} [portableRoot]
 */
export async function setEntryLevel(relativePath, level, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('경로가 올바르지 않습니다.');
  }

  await fsService.statPath(normalizedPath);

  const store = await loadStore(portableRoot);
  const next = writeEntryLevel(store, normalizedPath, level);
  await saveStore(portableRoot, store);
  return { relativePath: normalizedPath, level: next };
}

/**
 * @param {{ path?: string, relativePath?: string, level?: number }[]} entries
 * @param {string} [portableRoot]
 */
export async function setEntryLevels(entries, portableRoot = getPortableRoot()) {
  const list = Array.isArray(entries) ? entries : [];
  const store = await loadStore(portableRoot);
  /** @type {{ relativePath: string, level: number }[]} */
  const written = [];
  for (const item of list) {
    const normalizedPath = String(item?.path || item?.relativePath || '').replace(/\\/g, '/');
    if (!normalizedPath || normalizedPath === '.') continue;
    await fsService.statPath(normalizedPath);
    const next = writeEntryLevel(store, normalizedPath, item?.level);
    written.push({ relativePath: normalizedPath, level: next });
  }
  if (written.length) await saveStore(portableRoot, store);
  return { entries: written };
}

/**
 * @param {string} relativePath
 * @param {boolean} collapsed
 * @param {string} [portableRoot]
 */
export async function setEntryCollapsed(relativePath, collapsed, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('경로가 올바르지 않습니다.');
  }

  await fsService.statPath(normalizedPath);

  const store = await loadStore(portableRoot);
  if (collapsed) store.collapsed[normalizedPath] = true;
  else delete store.collapsed[normalizedPath];
  await saveStore(portableRoot, store);
  return { relativePath: normalizedPath, collapsed: Boolean(collapsed) };
}

/**
 * @param {{ path?: string, relativePath?: string, collapsed?: boolean }[]} entries
 * @param {string} [portableRoot]
 */
export async function setEntryCollapsedMany(entries, portableRoot = getPortableRoot()) {
  const list = Array.isArray(entries) ? entries : [];
  const store = await loadStore(portableRoot);
  /** @type {{ relativePath: string, collapsed: boolean }[]} */
  const written = [];
  for (const item of list) {
    const normalizedPath = String(item?.path || item?.relativePath || '').replace(/\\/g, '/');
    if (!normalizedPath || normalizedPath === '.') continue;
    await fsService.statPath(normalizedPath);
    const collapsed = Boolean(item?.collapsed);
    if (collapsed) store.collapsed[normalizedPath] = true;
    else delete store.collapsed[normalizedPath];
    written.push({ relativePath: normalizedPath, collapsed });
  }
  if (written.length) await saveStore(portableRoot, store);
  return { entries: written };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFolderColorsMoveTree(
  fromRelative,
  toRelative,
  portableRoot = getPortableRoot(),
) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  const colors = remapPathKeyedRecord(store.colors, fromPath, toPath);
  const bold = remapPathKeyedRecord(store.bold, fromPath, toPath);
  const levels = remapPathKeyedRecord(store.levels, fromPath, toPath);
  const collapsed = remapPathKeyedRecord(store.collapsed, fromPath, toPath);
  if (!colors.changed && !bold.changed && !levels.changed && !collapsed.changed) return;

  store.colors = colors.next;
  store.bold = bold.next;
  store.levels = levels.next;
  store.collapsed = collapsed.next;
  await saveStore(portableRoot, store);
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFolderColorsDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  const colorsChanged = deletePathKeyedRecord(store.colors, normalizedPath);
  const boldChanged = deletePathKeyedRecord(store.bold, normalizedPath);
  const levelsChanged = deletePathKeyedRecord(store.levels, normalizedPath);
  const collapsedChanged = deletePathKeyedRecord(store.collapsed, normalizedPath);
  if (colorsChanged || boldChanged || levelsChanged || collapsedChanged) {
    await saveStore(portableRoot, store);
  }
}

/**
 * @template T
 * @param {Record<string, T>} record
 * @param {string} fromPath
 * @param {string} toPath
 */
function remapPathKeyedRecord(record, fromPath, toPath) {
  let changed = false;
  /** @type {Record<string, T>} */
  const next = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      next[`${toPath}${suffix}`] = value;
      changed = true;
    } else {
      next[key] = value;
    }
  }
  return { next, changed };
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} relativePath
 */
function deletePathKeyedRecord(record, relativePath) {
  let changed = false;
  for (const key of Object.keys(record)) {
    if (key === relativePath || key.startsWith(`${relativePath}/`)) {
      delete record[key];
      changed = true;
    }
  }
  return changed;
}



