import fs from 'node:fs/promises';
import path from 'node:path';
import { TRASH_FOLDER } from '../shared/constants.js';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { syncSharePathDelete, syncSharePathMoveTree } from './shareLinkService.js';
import { syncFileAccessDelete, syncFileAccessMoveTree } from './fileAccessService.js';

const TRASH_INDEX_FILE = '.educowork-trash.json';

/**
 * @typedef {{ originalPath: string, deletedAt: string, isDirectory: boolean }} TrashItemRecord
 * @typedef {{ items: Record<string, TrashItemRecord> }} TrashStore
 */

/**
 * @param {string} relativePath
 */
function normalizePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isTrashPath(relativePath) {
  const normalized = normalizePath(relativePath);
  return normalized === TRASH_FOLDER || normalized.startsWith(`${TRASH_FOLDER}/`);
}

/**
 * @param {Set<string>|string[]} existingNames
 * @param {string} desiredName
 */
function resolveUniqueName(existingNames, desiredName) {
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames);
  if (!names.has(desiredName)) return desiredName;

  const extIndex = desiredName.lastIndexOf('.');
  const hasExt = extIndex > 0;
  const stem = hasExt ? desiredName.slice(0, extIndex) : desiredName;
  const ext = hasExt ? desiredName.slice(extIndex) : '';

  let counter = 1;
  while (names.has(`${stem} (${counter})${ext}`)) counter += 1;
  return `${stem} (${counter})${ext}`;
}

/**
 * @param {string} relativePath
 */
function getParentPath(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized === '.') return '.';
  const parts = normalized.split('/');
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

/**
 * @param {string} relativePath
 */
function getBaseName(relativePath) {
  return normalizePath(relativePath).split('/').pop() ?? relativePath;
}

/**
 * @param {string} portableRoot
 * @returns {Promise<TrashStore>}
 */
async function loadIndex(portableRoot) {
  const filePath = path.join(portableRoot, TRASH_INDEX_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.items === 'object') {
      return { items: parsed.items };
    }
  } catch {
    // fall through
  }
  return { items: {} };
}

/**
 * @param {string} portableRoot
 * @param {TrashStore} store
 */
async function saveIndex(portableRoot, store) {
  const filePath = path.join(portableRoot, TRASH_INDEX_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

async function ensureTrashFolder() {
  if (!(await fsService.pathExists(TRASH_FOLDER))) {
    await fsService.mkdir(TRASH_FOLDER);
  }
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} portableRoot
 */
async function syncMetadataMoveTree(fromRelative, toRelative, portableRoot) {
  await syncSharePathMoveTree(fromRelative, toRelative, portableRoot);
  await syncFileAccessMoveTree(fromRelative, toRelative, portableRoot);
}

/**
 * @param {string} [portableRoot]
 */
async function syncTrashIndexWithDisk(portableRoot) {
  await ensureTrashFolder();

  const store = await loadIndex(portableRoot);
  let changed = false;

  try {
    const diskEntries = await fsService.readDir(TRASH_FOLDER);
    const indexedKeys = new Set(Object.keys(store.items));

    for (const entry of diskEntries) {
      indexedKeys.delete(entry.relativePath);
      if (store.items[entry.relativePath]) continue;

      store.items[entry.relativePath] = {
        originalPath: getBaseName(entry.relativePath),
        deletedAt: entry.inaccessible ? new Date().toISOString() : entry.modifiedAt,
        isDirectory: entry.isDirectory,
      };
      changed = true;
    }

    for (const stalePath of indexedKeys) {
      delete store.items[stalePath];
      changed = true;
    }
  } catch {
    return store;
  }

  if (changed) {
    await saveIndex(portableRoot, store);
  }

  return store;
}

/**
 * @param {string} [portableRoot]
 */
export async function getTrashMap(portableRoot = getPortableRoot()) {
  const store = await syncTrashIndexWithDisk(portableRoot);
  return store.items;
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function trashPath(relativePath, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(relativePath);
  if (!normalized || normalized === '.' || isTrashPath(normalized)) {
    throw new Error('휴지통으로 이동할 수 없는 항목입니다.');
  }

  await ensureTrashFolder();
  const stat = await fsService.statPath(normalized);
  const trashEntries = await fsService.readDir(TRASH_FOLDER);
  const trashNames = trashEntries.map((entry) => entry.name);
  const uniqueName = resolveUniqueName(trashNames, getBaseName(normalized));
  const trashDest = `${TRASH_FOLDER}/${uniqueName}`;

  await syncMetadataMoveTree(normalized, trashDest, portableRoot);
  await fsService.movePath(normalized, trashDest);

  const store = await loadIndex(portableRoot);
  store.items[trashDest] = {
    originalPath: normalized,
    deletedAt: new Date().toISOString(),
    isDirectory: stat.isDirectory,
  };
  await saveIndex(portableRoot, store);

  return { trashPath: trashDest, originalPath: normalized };
}

/**
 * @param {string} trashRelativePath
 * @param {string} [portableRoot]
 */
export async function restorePath(trashRelativePath, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(trashRelativePath);
  if (!isTrashPath(normalized) || normalized === TRASH_FOLDER) {
    throw new Error('복원할 수 없는 항목입니다.');
  }

  const store = await loadIndex(portableRoot);
  const meta = store.items[normalized];
  if (!meta) {
    throw new Error('휴지통 정보를 찾을 수 없습니다.');
  }

  const originalPath = meta.originalPath;
  const parent = getParentPath(originalPath);
  const siblingEntries = await fsService.readDir(parent);
  const names = siblingEntries.map((entry) => entry.name);
  const baseName = getBaseName(originalPath);
  const uniqueName = names.includes(baseName) ? resolveUniqueName(names, baseName) : baseName;
  const restoreDest = parent === '.' ? uniqueName : `${parent}/${uniqueName}`;

  await syncMetadataMoveTree(normalized, restoreDest, portableRoot);
  await fsService.movePath(normalized, restoreDest);
  delete store.items[normalized];
  await saveIndex(portableRoot, store);

  return { restoredPath: restoreDest, originalPath };
}

/**
 * @param {string} trashRelativePath
 * @param {string} [portableRoot]
 */
export async function deletePermanent(trashRelativePath, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(trashRelativePath);
  if (!isTrashPath(normalized) || normalized === TRASH_FOLDER) {
    throw new Error('영구 삭제할 수 없는 항목입니다.');
  }

  await syncSharePathDelete(normalized, portableRoot);
  await syncFileAccessDelete(normalized, portableRoot);
  await fsService.deletePath(normalized);

  const store = await loadIndex(portableRoot);
  delete store.items[normalized];
  for (const key of Object.keys(store.items)) {
    if (key.startsWith(`${normalized}/`)) {
      delete store.items[key];
    }
  }
  await saveIndex(portableRoot, store);

  return true;
}

/**
 * @param {string} [portableRoot]
 */
export async function emptyTrash(portableRoot = getPortableRoot()) {
  try {
    const entries = await fsService.readDir(TRASH_FOLDER);
    for (const entry of entries) {
      await deletePermanent(entry.relativePath, portableRoot);
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const store = await loadIndex(portableRoot);
  store.items = {};
  await saveIndex(portableRoot, store);

  return true;
}
