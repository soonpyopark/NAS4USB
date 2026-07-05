import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot, resolvePortablePath } from './appContext.js';

const SHARE_FILE = '.educowork-shares.json';

/**
 * @typedef {{ token: string, createdAt: string }} ShareLinkRecord
 * @typedef {{ links: Record<string, ShareLinkRecord> }} ShareLinkStore
 */

/**
 * @param {string} portableRoot
 * @returns {Promise<ShareLinkStore>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, SHARE_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.links === 'object') {
      return { links: parsed.links };
    }
  } catch {
    // fall through
  }
  return { links: {} };
}

/**
 * @param {string} portableRoot
 * @param {ShareLinkStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, SHARE_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {string} [portableRoot]
 */
export async function getShareMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.links;
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function getShareStatus(relativePath, portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.links[relativePath] ?? null;
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function createShareLink(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('공유할 파일 경로가 올바르지 않습니다.');
  }

  const absolute = resolvePortablePath(normalizedPath);
  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) {
    throw new Error('폴더는 공유링크를 만들 수 없습니다.');
  }

  const store = await loadStore(portableRoot);
  const existing = store.links[normalizedPath];
  if (existing) {
    return { relativePath: normalizedPath, ...existing };
  }

  const token = crypto.randomBytes(16).toString('hex');
  const record = { token, createdAt: new Date().toISOString() };
  store.links[normalizedPath] = record;
  await saveStore(portableRoot, store);

  return { relativePath: normalizedPath, ...record };
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function revokeShareLink(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  if (!store.links[normalizedPath]) {
    return { revoked: false };
  }

  delete store.links[normalizedPath];
  await saveStore(portableRoot, store);
  return { revoked: true };
}

/**
 * @param {string} token
 * @param {string} [portableRoot]
 */
export async function resolveShareToken(token, portableRoot = getPortableRoot()) {
  const normalizedToken = String(token ?? '').trim();
  if (!normalizedToken) return null;

  const store = await loadStore(portableRoot);
  for (const [relativePath, link] of Object.entries(store.links)) {
    if (link.token !== normalizedToken) continue;

    try {
      const absolute = resolvePortablePath(relativePath);
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) {
        delete store.links[relativePath];
        await saveStore(portableRoot, store);
        return null;
      }

      const fileName = path.basename(absolute);
      return {
        relativePath,
        token: link.token,
        createdAt: link.createdAt,
        name: fileName,
        extension: path.extname(fileName).slice(1).toLowerCase() || null,
        isDirectory: false,
      };
    } catch {
      delete store.links[relativePath];
      await saveStore(portableRoot, store);
      return null;
    }
  }

  return null;
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncSharePathRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  const record = store.links[fromPath];
  if (!record) return;

  delete store.links[fromPath];
  store.links[toPath] = record;
  await saveStore(portableRoot, store);
}

/**
 * Move share-link keys when a file or folder tree is relocated (e.g. to/from trash).
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncSharePathMoveTree(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;
  /** @type {Record<string, ShareLinkRecord>} */
  const nextLinks = {};

  for (const [key, record] of Object.entries(store.links)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      nextLinks[`${toPath}${suffix}`] = record;
      changed = true;
    } else {
      nextLinks[key] = record;
    }
  }

  if (changed) {
    store.links = nextLinks;
    await saveStore(portableRoot, store);
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncSharePathDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;

  for (const key of Object.keys(store.links)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      delete store.links[key];
      changed = true;
    }
  }

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
