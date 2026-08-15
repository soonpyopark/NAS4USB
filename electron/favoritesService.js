import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';

const FAVORITES_FILE = '.nas4usb-favorites.json';

/**
 * Values carry the entry kind so the UI can split folder and file favorites
 * without stat-ing every path. Legacy stores hold `true`, which means a file.
 *
 * @typedef {'file' | 'folder'} FavoriteKind
 * @typedef {{
 *   favorites: Record<string, FavoriteKind | boolean>,
 *   folderOrder: string[],
 *   fileOrder: string[],
 * }} FavoritesStore
 */

/**
 * @param {FavoriteKind | boolean | undefined} value
 * @returns {FavoriteKind}
 */
function favoriteKind(value) {
  return value === 'folder' ? 'folder' : 'file';
}

/**
 * @param {string} portableRoot
 * @returns {Promise<FavoritesStore>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, FAVORITES_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.favorites === 'object') {
      return {
        favorites: parsed.favorites,
        folderOrder: sanitizePathList(parsed.folderOrder),
        fileOrder: sanitizePathList(parsed.fileOrder),
      };
    }
  } catch {
    // fall through
  }
  return { favorites: {}, folderOrder: [], fileOrder: [] };
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function sanitizePathList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const paths = [];
  const seen = new Set();
  for (const raw of value) {
    const item = String(raw ?? '').replace(/\\/g, '/').trim();
    if (!item || item === '.' || seen.has(item)) continue;
    seen.add(item);
    paths.push(item);
  }
  return paths;
}

/**
 * @param {string[]} saved
 * @param {string[]} existing
 */
function materializeFavoriteOrder(saved, existing) {
  const present = new Set(existing);
  const next = saved.filter((item) => present.has(item));
  const seen = new Set(next);
  for (const item of existing) {
    if (!seen.has(item)) next.push(item);
  }
  return next;
}

/**
 * @param {string[]} list
 * @param {string} fromPath
 * @param {string} toPath
 */
function rewriteOrderPath(list, fromPath, toPath) {
  return list.map((item) => {
    if (item === fromPath) return toPath;
    if (item.startsWith(`${fromPath}/`)) return `${toPath}${item.slice(fromPath.length)}`;
    return item;
  });
}

/**
 * @param {string} portableRoot
 * @param {FavoritesStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, FAVORITES_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {string} [portableRoot]
 */
export async function getFavoritesMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.favorites;
}

/**
 * @param {string} relativePath
 * @param {boolean} favorited
 * @param {string} [portableRoot]
 */
export async function setFavorite(relativePath, favorited, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('파일 경로가 올바르지 않습니다.');
  }

  const store = await loadStore(portableRoot);

  if (favorited) {
    const stat = await fsService.statPath(normalizedPath);
    const kind = stat.isDirectory ? 'folder' : 'file';
    store.favorites[normalizedPath] = kind;
    const orderKey = kind === 'folder' ? 'folderOrder' : 'fileOrder';
    if (!store[orderKey].includes(normalizedPath)) {
      store[orderKey] = [...store[orderKey], normalizedPath];
    }
  } else {
    delete store.favorites[normalizedPath];
    store.folderOrder = store.folderOrder.filter((item) => item !== normalizedPath);
    store.fileOrder = store.fileOrder.filter((item) => item !== normalizedPath);
  }

  await saveStore(portableRoot, store);
  return { relativePath: normalizedPath, favorited: Boolean(favorited) };
}

/**
 * @param {string} [portableRoot]
 */
export async function listFavoriteEntries(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  const paths = Object.keys(store.favorites).filter((key) => store.favorites[key]);
  /** @type {import('../src/types/nas4usb.d.ts').FsEntry[]} */
  const entries = [];
  let changed = false;

  for (const relativePath of paths) {
    try {
      const stat = await fsService.statPath(relativePath);
      const kind = stat.isDirectory ? 'folder' : 'file';
      if (favoriteKind(store.favorites[relativePath]) !== kind) {
        store.favorites[relativePath] = kind;
        changed = true;
      }

      entries.push({
        name: stat.name,
        relativePath: stat.relativePath,
        isDirectory: stat.isDirectory,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
        extension: stat.extension,
      });
    } catch {
      delete store.favorites[relativePath];
      changed = true;
    }
  }

  const nextFolderOrder = materializeFavoriteOrder(
    store.folderOrder,
    entries.filter((entry) => entry.isDirectory).map((entry) => entry.relativePath),
  );
  const nextFileOrder = materializeFavoriteOrder(
    store.fileOrder,
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.relativePath),
  );
  const orderChanged =
    JSON.stringify(store.folderOrder) !== JSON.stringify(nextFolderOrder) ||
    JSON.stringify(store.fileOrder) !== JSON.stringify(nextFileOrder);
  store.folderOrder = nextFolderOrder;
  store.fileOrder = nextFileOrder;
  if (changed || orderChanged) {
    await saveStore(portableRoot, store);
  }

  const folderRank = new Map(store.folderOrder.map((item, index) => [item, index]));
  const fileRank = new Map(store.fileOrder.map((item, index) => [item, index]));
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const rank = a.isDirectory ? folderRank : fileRank;
    const aRank = rank.has(a.relativePath) ? rank.get(a.relativePath) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b.relativePath) ? rank.get(b.relativePath) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name, 'ko');
  });
  return entries;
}

/**
 * @param {'folder' | 'file'} kind
 * @param {unknown} paths
 * @param {string} [portableRoot]
 */
export async function setFavoriteOrder(kind, paths, portableRoot = getPortableRoot()) {
  const orderKind = kind === 'folder' ? 'folder' : 'file';
  const store = await loadStore(portableRoot);
  const existing = Object.keys(store.favorites).filter(
    (key) => favoriteKind(store.favorites[key]) === orderKind,
  );
  const next = materializeFavoriteOrder(sanitizePathList(paths), existing);
  if (orderKind === 'folder') store.folderOrder = next;
  else store.fileOrder = next;
  await saveStore(portableRoot, store);
  return { kind: orderKind, paths: next };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFavoritesRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  const kind = store.favorites[fromPath];
  if (!kind) return;

  delete store.favorites[fromPath];
  store.favorites[toPath] = favoriteKind(kind);
  store.folderOrder = rewriteOrderPath(store.folderOrder, fromPath, toPath);
  store.fileOrder = rewriteOrderPath(store.fileOrder, fromPath, toPath);
  await saveStore(portableRoot, store);
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFavoritesMoveTree(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;
  /** @type {Record<string, boolean>} */
  const nextFavorites = {};

  for (const [key, value] of Object.entries(store.favorites)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      nextFavorites[`${toPath}${suffix}`] = value;
      changed = true;
    } else {
      nextFavorites[key] = value;
    }
  }

  if (changed) {
    store.favorites = nextFavorites;
    store.folderOrder = rewriteOrderPath(store.folderOrder, fromPath, toPath);
    store.fileOrder = rewriteOrderPath(store.fileOrder, fromPath, toPath);
    await saveStore(portableRoot, store);
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFavoritesDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;

  for (const key of Object.keys(store.favorites)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      delete store.favorites[key];
      changed = true;
    }
  }

  store.folderOrder = store.folderOrder.filter(
    (item) => item !== normalizedPath && !item.startsWith(`${normalizedPath}/`),
  );
  store.fileOrder = store.fileOrder.filter(
    (item) => item !== normalizedPath && !item.startsWith(`${normalizedPath}/`),
  );

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
