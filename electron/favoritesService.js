import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ADMIN_ID } from '../shared/constants.js';
import { sanitizeLoginIdForHomeFolder } from '../shared/memberHomes.js';
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
 * }} FavoritesBucket
 * @typedef {{
 *   version: 2,
 *   users: Record<string, FavoritesBucket>,
 * }} FavoritesFile
 */

/**
 * @param {FavoriteKind | boolean | undefined} value
 * @returns {FavoriteKind}
 */
function favoriteKind(value) {
  return value === 'folder' ? 'folder' : 'file';
}

/**
 * @returns {FavoritesBucket}
 */
function emptyBucket() {
  return { favorites: {}, folderOrder: [], fileOrder: [] };
}

/**
 * @param {unknown} loginId
 */
function favoritesOwnerKey(loginId) {
  return sanitizeLoginIdForHomeFolder(loginId);
}

/**
 * @param {Record<string, FavoritesBucket>} users
 * @param {string} loginId
 */
function resolveUserKey(users, loginId) {
  const key = favoritesOwnerKey(loginId);
  if (!key) return '';
  if (users[key]) return key;
  const lower = key.toLowerCase();
  return Object.keys(users).find((item) => item.toLowerCase() === lower) || key;
}

/**
 * @param {unknown} parsed
 * @returns {FavoritesFile}
 */
function normalizeFile(parsed) {
  if (parsed && typeof parsed === 'object' && parsed.users && typeof parsed.users === 'object') {
    /** @type {Record<string, FavoritesBucket>} */
    const users = {};
    for (const [key, raw] of Object.entries(parsed.users)) {
      if (!raw || typeof raw !== 'object') continue;
      users[key] = {
        favorites: raw.favorites && typeof raw.favorites === 'object' ? raw.favorites : {},
        folderOrder: sanitizePathList(raw.folderOrder),
        fileOrder: sanitizePathList(raw.fileOrder),
      };
    }
    return { version: 2, users };
  }
  if (parsed && typeof parsed === 'object' && parsed.favorites && typeof parsed.favorites === 'object') {
    const adminKey = favoritesOwnerKey(DEFAULT_ADMIN_ID) || 'admin';
    return {
      version: 2,
      users: {
        [adminKey]: {
          favorites: parsed.favorites,
          folderOrder: sanitizePathList(parsed.folderOrder),
          fileOrder: sanitizePathList(parsed.fileOrder),
        },
      },
    };
  }
  return { version: 2, users: {} };
}

/**
 * @param {string} portableRoot
 * @returns {Promise<FavoritesFile>}
 */
async function loadFile(portableRoot) {
  const filePath = path.join(portableRoot, FAVORITES_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const next = normalizeFile(parsed);
    const wasLegacy = !(parsed && typeof parsed === 'object' && parsed.users);
    if (wasLegacy && Object.keys(next.users).length > 0) {
      await saveFile(portableRoot, next);
    }
    return next;
  } catch {
    return { version: 2, users: {} };
  }
}

/**
 * @param {FavoritesFile} file
 * @param {string} loginId
 * @returns {FavoritesBucket}
 */
function getBucket(file, loginId) {
  const key = resolveUserKey(file.users, loginId);
  if (!key) return emptyBucket();
  return file.users[key] ? file.users[key] : emptyBucket();
}

/**
 * @param {FavoritesFile} file
 * @param {string} loginId
 * @param {FavoritesBucket} bucket
 */
function setBucket(file, loginId, bucket) {
  const key = resolveUserKey(file.users, loginId);
  if (!key) return;
  file.users[key] = bucket;
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
 * @param {FavoritesFile} file
 */
async function saveFile(portableRoot, file) {
  const filePath = path.join(portableRoot, FAVORITES_FILE);
  await fs.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} [loginId]
 * @param {string} [portableRoot]
 */
export async function getFavoritesMap(loginId, portableRoot = getPortableRoot()) {
  if (!favoritesOwnerKey(loginId)) return {};
  const file = await loadFile(portableRoot);
  return getBucket(file, loginId).favorites;
}

/**
 * @param {string} relativePath
 * @param {boolean} favorited
 * @param {string} loginId
 * @param {string} [portableRoot]
 */
export async function setFavorite(
  relativePath,
  favorited,
  loginId,
  portableRoot = getPortableRoot(),
) {
  if (!favoritesOwnerKey(loginId)) {
    throw new Error('로그인이 필요합니다.');
  }
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('파일 경로가 올바르지 않습니다.');
  }

  const file = await loadFile(portableRoot);
  const store = getBucket(file, loginId);

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

  setBucket(file, loginId, store);
  await saveFile(portableRoot, file);
  return { relativePath: normalizedPath, favorited: Boolean(favorited) };
}

/**
 * @param {string} [loginId]
 * @param {string} [portableRoot]
 */
export async function listFavoriteEntries(loginId, portableRoot = getPortableRoot()) {
  if (!favoritesOwnerKey(loginId)) return [];
  const file = await loadFile(portableRoot);
  const store = getBucket(file, loginId);
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
    setBucket(file, loginId, store);
    await saveFile(portableRoot, file);
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
 * @param {string} loginId
 * @param {string} [portableRoot]
 */
export async function setFavoriteOrder(kind, paths, loginId, portableRoot = getPortableRoot()) {
  if (!favoritesOwnerKey(loginId)) {
    throw new Error('로그인이 필요합니다.');
  }
  const orderKind = kind === 'folder' ? 'folder' : 'file';
  const file = await loadFile(portableRoot);
  const store = getBucket(file, loginId);
  const existing = Object.keys(store.favorites).filter(
    (key) => favoriteKind(store.favorites[key]) === orderKind,
  );
  const next = materializeFavoriteOrder(sanitizePathList(paths), existing);
  if (orderKind === 'folder') store.folderOrder = next;
  else store.fileOrder = next;
  setBucket(file, loginId, store);
  await saveFile(portableRoot, file);
  return { kind: orderKind, paths: next };
}

/**
 * @param {FavoritesBucket} store
 * @param {string} fromPath
 * @param {string} toPath
 */
function rewriteBucketMove(store, fromPath, toPath) {
  const kind = store.favorites[fromPath];
  if (!kind && !Object.keys(store.favorites).some((key) => key.startsWith(`${fromPath}/`))) {
    return false;
  }
  if (kind) {
    delete store.favorites[fromPath];
    store.favorites[toPath] = favoriteKind(kind);
  }
  store.folderOrder = rewriteOrderPath(store.folderOrder, fromPath, toPath);
  store.fileOrder = rewriteOrderPath(store.fileOrder, fromPath, toPath);
  return true;
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFavoritesRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const file = await loadFile(portableRoot);
  let changed = false;
  for (const store of Object.values(file.users)) {
    if (rewriteBucketMove(store, fromPath, toPath)) changed = true;
  }
  if (changed) await saveFile(portableRoot, file);
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFavoritesMoveTree(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const file = await loadFile(portableRoot);
  let changed = false;

  for (const store of Object.values(file.users)) {
    /** @type {Record<string, FavoriteKind | boolean>} */
    const nextFavorites = {};
    let bucketChanged = false;
    for (const [key, value] of Object.entries(store.favorites)) {
      if (key === fromPath || key.startsWith(`${fromPath}/`)) {
        const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
        nextFavorites[`${toPath}${suffix}`] = value;
        bucketChanged = true;
      } else {
        nextFavorites[key] = value;
      }
    }
    if (bucketChanged) {
      store.favorites = nextFavorites;
      store.folderOrder = rewriteOrderPath(store.folderOrder, fromPath, toPath);
      store.fileOrder = rewriteOrderPath(store.fileOrder, fromPath, toPath);
      changed = true;
    }
  }

  if (changed) await saveFile(portableRoot, file);
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFavoritesDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const file = await loadFile(portableRoot);
  let changed = false;

  for (const store of Object.values(file.users)) {
    let bucketChanged = false;
    for (const key of Object.keys(store.favorites)) {
      if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
        delete store.favorites[key];
        bucketChanged = true;
      }
    }
    store.folderOrder = store.folderOrder.filter(
      (item) => item !== normalizedPath && !item.startsWith(`${normalizedPath}/`),
    );
    store.fileOrder = store.fileOrder.filter(
      (item) => item !== normalizedPath && !item.startsWith(`${normalizedPath}/`),
    );
    if (bucketChanged) changed = true;
  }

  if (changed) await saveFile(portableRoot, file);
}
