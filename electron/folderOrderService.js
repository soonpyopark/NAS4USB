import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import {
  canPersistFolderOrder,
  isFixedFolderOrderPath,
  normalizeFolderOrderParent,
  resolveFolderOrderParent,
} from '../shared/folderOrder.js';

const FOLDER_ORDER_FILE = '.nas4usb-folder-order.json';

/**
 * @typedef {{ orders: Record<string, string[]> }} FolderOrderStore
 */

/**
 * @param {string} relativePath
 */
function parentOf(relativePath) {
  const normalized = normalizeFolderOrderParent(relativePath);
  if (normalized === '.') return '.';
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '.' : normalized.slice(0, index);
}

/**
 * @param {string} relativePath
 */
function baseNameOf(relativePath) {
  const normalized = normalizeFolderOrderParent(relativePath);
  if (normalized === '.') return '';
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/**
 * @param {string} parentPath
 * @param {string} name
 */
function joinChild(parentPath, name) {
  const parent = normalizeFolderOrderParent(parentPath);
  return parent === '.' ? name : `${parent}/${name}`;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function sanitizeNameList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  for (const raw of value) {
    const name = String(raw ?? '').trim();
    if (!name || name === '.' || name === '..' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * @param {string} portableRoot
 * @returns {Promise<FolderOrderStore>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, FOLDER_ORDER_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.orders === 'object' && parsed.orders) {
      /** @type {Record<string, string[]>} */
      const orders = {};
      for (const [key, value] of Object.entries(parsed.orders)) {
        const parent = normalizeFolderOrderParent(key);
        const names = sanitizeNameList(value);
        if (names.length > 0) orders[parent] = names;
      }
      return { orders };
    }
  } catch {
    // fall through
  }
  return { orders: {} };
}

/**
 * @param {string} portableRoot
 * @param {FolderOrderStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, FOLDER_ORDER_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {Record<string, string[]>} orders
 * @param {string} parentPath
 * @param {string} name
 */
function removeNameFromParent(orders, parentPath, name) {
  const parent = normalizeFolderOrderParent(parentPath);
  const list = orders[parent];
  if (!list) return false;
  const next = list.filter((item) => item !== name);
  if (next.length === list.length) return false;
  if (next.length === 0) delete orders[parent];
  else orders[parent] = next;
  return true;
}

/**
 * @param {Record<string, string[]>} orders
 * @param {string} parentPath
 * @param {string} name
 */
function appendNameToParent(orders, parentPath, name) {
  const parent = normalizeFolderOrderParent(parentPath);
  if (!canPersistFolderOrder(parent) || !name) return false;
  const list = orders[parent];
  if (!list) return false;
  if (list.includes(name)) return false;
  orders[parent] = [...list, name];
  return true;
}

/**
 * @param {Record<string, string[]>} orders
 * @param {string} parentPath
 * @param {string} fromName
 * @param {string} toName
 */
function renameNameInParent(orders, parentPath, fromName, toName) {
  const parent = normalizeFolderOrderParent(parentPath);
  const list = orders[parent];
  if (!list) return false;
  const index = list.indexOf(fromName);
  if (index === -1) return false;
  if (fromName === toName) return false;
  const next = list.filter((item) => item !== toName);
  const writeAt = Math.min(index, next.length);
  if (next[writeAt] !== toName) {
    next.splice(writeAt, 0, toName);
  }
  const fromIndex = next.indexOf(fromName);
  if (fromIndex !== -1) next.splice(fromIndex, 1);
  orders[parent] = next;
  return true;
}

/**
 * @param {string} [portableRoot]
 */
export async function getFolderOrderMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.orders;
}

/**
 * @param {string} parentPath
 * @param {unknown} names
 * @param {string} [portableRoot]
 */
export async function setFolderOrder(
  parentPath,
  names,
  portableRoot = getPortableRoot(),
  loginId = null,
) {
  const normalizedParent = resolveFolderOrderParent(parentPath, loginId);
  if (!canPersistFolderOrder(normalizedParent)) {
    throw new Error('이 폴더에서는 순서를 저장할 수 없습니다.');
  }

  if (normalizedParent !== '.') {
    const stat = await fsService.statPath(normalizedParent);
    if (!stat.isDirectory) {
      throw new Error('폴더 경로가 올바르지 않습니다.');
    }
  }

  const requested = sanitizeNameList(names).filter((name) => {
    const childPath = joinChild(normalizedParent, name);
    return !isFixedFolderOrderPath(childPath);
  });

  /** @type {string[]} */
  const existing = [];
  for (const name of requested) {
    const childPath = joinChild(normalizedParent, name);
    if (await fsService.pathExists(childPath)) existing.push(name);
  }

  const store = await loadStore(portableRoot);
  if (existing.length === 0) delete store.orders[normalizedParent];
  else store.orders[normalizedParent] = existing;
  await saveStore(portableRoot, store);
  return { relativePath: normalizedParent, names: existing };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFolderOrderMoveTree(
  fromRelative,
  toRelative,
  portableRoot = getPortableRoot(),
) {
  const fromPath = normalizeFolderOrderParent(fromRelative);
  const toPath = normalizeFolderOrderParent(toRelative);
  if (!fromPath || fromPath === '.' || fromPath === toPath) return;

  const store = await loadStore(portableRoot);
  let changed = false;
  const fromParent = parentOf(fromPath);
  const toParent = parentOf(toPath);
  const fromName = baseNameOf(fromPath);
  const toName = baseNameOf(toPath);

  if (fromParent === toParent) {
    if (renameNameInParent(store.orders, fromParent, fromName, toName)) changed = true;
  } else {
    if (removeNameFromParent(store.orders, fromParent, fromName)) changed = true;
    if (appendNameToParent(store.orders, toParent, toName)) changed = true;
  }

  /** @type {Record<string, string[]>} */
  const nextOrders = {};
  for (const [key, value] of Object.entries(store.orders)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      nextOrders[`${toPath}${suffix}`] = value;
      changed = true;
    } else {
      nextOrders[key] = value;
    }
  }

  if (changed) {
    store.orders = nextOrders;
    await saveStore(portableRoot, store);
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFolderOrderDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = normalizeFolderOrderParent(relativePath);
  if (!normalizedPath || normalizedPath === '.') return;

  const store = await loadStore(portableRoot);
  let changed = removeNameFromParent(store.orders, parentOf(normalizedPath), baseNameOf(normalizedPath));

  for (const key of Object.keys(store.orders)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      delete store.orders[key];
      changed = true;
    }
  }

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
