import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';

const FAVORITES_FILE = '.nas4usb-favorites.json';

/**
 * @typedef {{ favorites: Record<string, boolean> }} FavoritesStore
 */

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
      return { favorites: parsed.favorites };
    }
  } catch {
    // fall through
  }
  return { favorites: {} };
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
    if (stat.isDirectory) {
      throw new Error('폴더는 즐겨찾기에 추가할 수 없습니다.');
    }
    store.favorites[normalizedPath] = true;
  } else {
    delete store.favorites[normalizedPath];
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
      if (stat.isDirectory) {
        delete store.favorites[relativePath];
        changed = true;
        continue;
      }

      entries.push({
        name: stat.name,
        relativePath: stat.relativePath,
        isDirectory: false,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
        extension: stat.extension,
      });
    } catch {
      delete store.favorites[relativePath];
      changed = true;
    }
  }

  if (changed) {
    await saveStore(portableRoot, store);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return entries;
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
  if (!store.favorites[fromPath]) return;

  delete store.favorites[fromPath];
  store.favorites[toPath] = true;
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

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
