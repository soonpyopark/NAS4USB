import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { normalizeFolderColorValue, pickRandomFolderColorKey } from '../shared/folderColors.js';
import { isFavoritesRelativePath, isTrashRelativePath } from '../shared/constants.js';
import { isFixedFolderOrderPath } from '../shared/folderOrder.js';
import { isHomesContainerPath, isMemberHomeRootPath } from '../shared/memberHomes.js';
import { isTiptapAssetSidecarRelativePath } from '../shared/tiptapAssetPaths.js';

const FOLDER_COLORS_FILE = '.nas4usb-folder-colors.json';

/**
 * @typedef {{ colors: Record<string, string> }} FolderColorsStore
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
    if (parsed && typeof parsed.colors === 'object') {
      return { colors: parsed.colors };
    }
  } catch {
    // fall through
  }
  return { colors: {} };
}

/**
 * @param {string} portableRoot
 * @param {FolderColorsStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, FOLDER_COLORS_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {string} [portableRoot]
 */
export async function getFolderColorsMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.colors;
}

/**
 * @param {string} relativePath
 * @param {string | null | undefined} color
 * @param {string} [portableRoot]
 */
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
  let changed = false;
  /** @type {Record<string, string>} */
  const nextColors = {};

  for (const [key, value] of Object.entries(store.colors)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      nextColors[`${toPath}${suffix}`] = value;
      changed = true;
    } else {
      nextColors[key] = value;
    }
  }

  if (changed) {
    store.colors = nextColors;
    await saveStore(portableRoot, store);
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFolderColorsDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;

  for (const key of Object.keys(store.colors)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      delete store.colors[key];
      changed = true;
    }
  }

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
