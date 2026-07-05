import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';

const ACCESS_FILE = '.educowork-file-access.json';

/**
 * @typedef {{ visibility?: 'public' | 'private', viewRestricted?: boolean }} FileAccessRecord
 * @typedef {{ files: Record<string, FileAccessRecord> }} FileAccessStore
 */

/**
 * @param {string} portableRoot
 * @returns {Promise<FileAccessStore>}
 */
async function loadStore(portableRoot) {
  const filePath = path.join(portableRoot, ACCESS_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.files === 'object') {
      return { files: parsed.files };
    }
  } catch {
    // fall through
  }
  return { files: {} };
}

/**
 * @param {string} portableRoot
 * @param {FileAccessStore} store
 */
async function saveStore(portableRoot, store) {
  const filePath = path.join(portableRoot, ACCESS_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {FileAccessRecord | undefined} record
 * @returns {Required<FileAccessRecord>}
 */
export function normalizeFileAccessRecord(record) {
  return {
    visibility: record?.visibility === 'private' ? 'private' : 'public',
    viewRestricted: Boolean(record?.viewRestricted),
  };
}

/**
 * @param {string} [portableRoot]
 */
export async function getFileAccessMap(portableRoot = getPortableRoot()) {
  const store = await loadStore(portableRoot);
  return store.files;
}

/**
 * @param {string} relativePath
 * @param {Partial<FileAccessRecord>} patch
 * @param {string} [portableRoot]
 */
export async function setFileAccess(relativePath, patch, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') {
    throw new Error('파일 경로가 올바르지 않습니다.');
  }

  const store = await loadStore(portableRoot);
  const current = normalizeFileAccessRecord(store.files[normalizedPath]);
  const next = normalizeFileAccessRecord({
    ...current,
    ...patch,
  });

  store.files[normalizedPath] = next;
  await saveStore(portableRoot, store);

  return { relativePath: normalizedPath, ...next };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFileAccessRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  const record = store.files[fromPath];
  if (!record) return;

  delete store.files[fromPath];
  store.files[toPath] = record;
  await saveStore(portableRoot, store);
}

/**
 * Move file-access keys when a file or folder tree is relocated (e.g. to/from trash).
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFileAccessMoveTree(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const fromPath = String(fromRelative ?? '').replace(/\\/g, '/');
  const toPath = String(toRelative ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;
  /** @type {Record<string, FileAccessRecord>} */
  const nextFiles = {};

  for (const [key, record] of Object.entries(store.files)) {
    if (key === fromPath || key.startsWith(`${fromPath}/`)) {
      const suffix = key.length === fromPath.length ? '' : key.slice(fromPath.length);
      nextFiles[`${toPath}${suffix}`] = record;
      changed = true;
    } else {
      nextFiles[key] = record;
    }
  }

  if (changed) {
    store.files = nextFiles;
    await saveStore(portableRoot, store);
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFileAccessDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const store = await loadStore(portableRoot);
  let changed = false;

  for (const key of Object.keys(store.files)) {
    if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
      delete store.files[key];
      changed = true;
    }
  }

  if (changed) {
    await saveStore(portableRoot, store);
  }
}
