import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataRoot, getPortableRoot, getTempPath, resolvePortablePath } from './appContext.js';
import { LEGACY_HISTORY_ROOT, LEGACY_LOCKS_FILE } from '../shared/legacyConfig.js';

const LOCKS_FILE = '.nas4usb/hwpx-locks.json';
const HISTORY_ROOT = '.nas4usb/hwpx-history';
const MAX_HISTORY = 10;

/** @type {Map<string, { relativePath: string, workingPath: string, sessionDir: string, holderId: string, userName: string }>} */
const editSessions = new Map();

/**
 * @param {string} relativePath
 */
function normalizePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
function encodeHistoryKey(relativePath) {
  return Buffer.from(normalizePath(relativePath), 'utf8').toString('base64url');
}

/**
 * @param {string} portableRoot
 */
function locksFilePath(portableRoot) {
  return path.join(portableRoot, LOCKS_FILE);
}

/**
 * @param {string} portableRoot
 */
function legacyLocksFilePath(portableRoot) {
  return path.join(portableRoot, LEGACY_LOCKS_FILE);
}

/**
 * @param {string} portableRoot
 * @param {string} relativePath
 */
function historyDir(portableRoot, relativePath) {
  return path.join(portableRoot, HISTORY_ROOT, encodeHistoryKey(relativePath));
}

/**
 * @param {string} portableRoot
 * @param {string} relativePath
 */
function legacyHistoryDir(portableRoot, relativePath) {
  return path.join(portableRoot, LEGACY_HISTORY_ROOT, encodeHistoryKey(relativePath));
}

/**
 * @param {string} portableRoot
 */
async function loadLockStore(portableRoot) {
  for (const filePath of [locksFilePath(portableRoot), legacyLocksFilePath(portableRoot)]) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.locks && typeof parsed.locks === 'object') {
        return { locks: parsed.locks };
      }
    } catch {
      // try next
    }
  }
  return { locks: {} };
}

/**
 * @param {string} portableRoot
 * @param {{ locks: Record<string, unknown> }} store
 */
async function saveLockStore(portableRoot, store) {
  const filePath = locksFilePath(portableRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
  await fs.rm(legacyLocksFilePath(portableRoot), { force: true }).catch(() => {});
}

/**
 * @param {string} portableRoot
 */
export async function getHwpxLockMap(portableRoot = getPortableRoot()) {
  const store = await loadLockStore(portableRoot);
  return store.locks;
}

/**
 * @param {string} relativePath
 * @param {string} holderId
 * @param {string} [portableRoot]
 */
export async function assertHwpxNotLockedByOther(relativePath, holderId, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(relativePath);
  const store = await loadLockStore(portableRoot);
  const lock = store.locks[normalized];
  if (!lock) return;
  if (lock.holderId === holderId) return;
  throw new Error(`${lock.userName}님이 편집 중입니다. 편집이 끝날 때까지 기다려 주세요.`);
}

/**
 * @param {string} dir
 */
async function loadHistoryManifest(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.entries)) {
      return { entries: parsed.entries };
    }
  } catch {
    // ignore
  }
  return { entries: [] };
}

/**
 * @param {string} dir
 * @param {{ entries: unknown[] }} manifest
 */
async function saveHistoryManifest(dir, manifest) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * @param {string} sourcePath
 * @param {string} dir
 * @param {{ label: string, kind: string, userName: string }} meta
 */
async function appendHistorySnapshot(sourcePath, dir, meta) {
  await fs.mkdir(dir, { recursive: true });
  const manifest = await loadHistoryManifest(dir);
  const stat = await fs.stat(sourcePath);
  const id = crypto.randomUUID();
  const entry = {
    id,
    label: meta.label,
    kind: meta.kind,
    userName: meta.userName,
    createdAt: new Date().toISOString(),
    size: stat.size,
  };

  await fs.copyFile(sourcePath, path.join(dir, `${id}.hwpx`));
  manifest.entries.unshift(entry);

  while (manifest.entries.length > MAX_HISTORY) {
    const removed = manifest.entries.pop();
    if (removed?.id) {
      await fs.rm(path.join(dir, `${removed.id}.hwpx`), { force: true });
    }
  }

  await saveHistoryManifest(dir, manifest);
  return entry;
}

async function resolveHistoryDir(portableRoot, relativePath) {
  const primary = historyDir(portableRoot, relativePath);
  try {
    await fs.access(path.join(primary, 'manifest.json'));
    return primary;
  } catch {
    const legacy = legacyHistoryDir(portableRoot, relativePath);
    try {
      await fs.access(path.join(legacy, 'manifest.json'));
      return legacy;
    } catch {
      return primary;
    }
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function listHwpxHistory(relativePath, portableRoot = getPortableRoot()) {
  const dir = await resolveHistoryDir(portableRoot, relativePath);
  const manifest = await loadHistoryManifest(dir);
  return manifest.entries;
}

/**
 * @param {string} relativePath
 * @param {string} entryId
 * @param {string} [portableRoot]
 */
export async function readHwpxHistoryBase64(relativePath, entryId, portableRoot = getPortableRoot()) {
  const dir = await resolveHistoryDir(portableRoot, relativePath);
  const filePath = path.join(dir, `${entryId}.hwpx`);
  const buffer = await fs.readFile(filePath);
  return buffer.toString('base64');
}

/**
 * @param {string} relativePath
 * @param {string} entryId
 * @param {{ holderId: string, userName: string }} actor
 * @param {string} [portableRoot]
 */
export async function deleteHwpxHistoryEntry(relativePath, entryId, actor, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(relativePath);
  await assertHwpxNotLockedByOther(normalized, actor.holderId, portableRoot);

  const dir = await resolveHistoryDir(portableRoot, normalized);
  const manifest = await loadHistoryManifest(dir);
  const nextEntries = manifest.entries.filter((entry) => entry.id !== entryId);
  if (nextEntries.length === manifest.entries.length) {
    throw new Error('이력을 찾을 수 없습니다.');
  }

  await fs.rm(path.join(dir, `${entryId}.hwpx`), { force: true });
  await saveHistoryManifest(dir, { entries: nextEntries });
  return { ok: true };
}

/**
 * @param {string} relativePath
 * @param {string} entryId
 * @param {{ holderId: string, userName: string }} actor
 * @param {string} [portableRoot]
 * @param {string} [dataRoot]
 */
export async function restoreHwpxHistoryEntry(
  relativePath,
  entryId,
  actor,
  portableRoot = getPortableRoot(),
  dataRoot = getDataRoot(),
) {
  const normalized = normalizePath(relativePath);
  await assertHwpxNotLockedByOther(normalized, actor.holderId, portableRoot);

  void dataRoot;
  const destination = resolvePortablePath(normalized);
  const dir = await resolveHistoryDir(portableRoot, normalized);
  const snapshotPath = path.join(dir, `${entryId}.hwpx`);

  try {
    await fs.access(snapshotPath);
  } catch {
    throw new Error('복원할 이력 파일을 찾을 수 없습니다.');
  }

  try {
    await fs.access(destination);
    await appendHistorySnapshot(destination, dir, {
      label: '복원 전',
      kind: 'restore-backup',
      userName: actor.userName,
    });
  } catch {
    // no current file
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(snapshotPath, destination);

  return { relativePath: normalized };
}

/**
 * @param {string} relativePath
 * @param {{ holderId: string, userName: string }} actor
 * @param {string} [dataRoot]
 * @param {string} [tempRoot]
 * @param {string} [portableRoot]
 */
export async function startHwpxSystemEdit(
  relativePath,
  actor,
  dataRoot = getDataRoot(),
  tempRoot = getTempPath(),
  portableRoot = getPortableRoot(),
) {
  const normalized = normalizePath(relativePath);
  if (!normalized.toLowerCase().endsWith('.hwpx')) {
    throw new Error('HWPX 파일만 시스템 편집할 수 있습니다.');
  }

  const store = await loadLockStore(portableRoot);
  const existing = store.locks[normalized];

  if (existing) {
    if (existing.holderId !== actor.holderId) {
      throw new Error(`${existing.userName}님이 편집 중입니다.`);
    }
    const session = editSessions.get(existing.editSessionId);
    if (session) {
      return {
        editSessionId: existing.editSessionId,
        relativePath: normalized,
        fileName: path.basename(normalized),
        workingPath: session.workingPath,
        reused: true,
      };
    }
  }

  for (const session of editSessions.values()) {
    if (session.holderId === actor.holderId && session.relativePath !== normalized) {
      throw new Error('다른 HWPX 파일 편집을 먼저 종료해 주세요.');
    }
  }

  void dataRoot;
  const sourcePath = resolvePortablePath(normalized);
  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error(`파일을 찾을 수 없습니다: ${normalized}`);
  }

  const historyPath = historyDir(portableRoot, normalized);
  await appendHistorySnapshot(sourcePath, historyPath, {
    label: '편집 전',
    kind: 'session-start',
    userName: actor.userName,
  });

  const editSessionId = crypto.randomUUID();
  const sessionDir = path.join(tempRoot, 'nas4usb', 'hwpx-edits', editSessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const fileName = path.basename(normalized);
  const workingPath = path.join(sessionDir, fileName);
  await fs.copyFile(sourcePath, workingPath);

  editSessions.set(editSessionId, {
    relativePath: normalized,
    workingPath,
    sessionDir,
    holderId: actor.holderId,
    userName: actor.userName,
  });

  store.locks[normalized] = {
    holderId: actor.holderId,
    userName: actor.userName,
    startedAt: new Date().toISOString(),
    editSessionId,
  };
  await saveLockStore(portableRoot, store);

  return {
    editSessionId,
    relativePath: normalized,
    fileName,
    workingPath,
    reused: false,
  };
}

/**
 * @param {string} editSessionId
 * @param {string} holderId
 * @param {string} [dataRoot]
 * @param {string} [portableRoot]
 */
export async function finishHwpxSystemEdit(
  editSessionId,
  holderId,
  dataRoot = getDataRoot(),
  portableRoot = getPortableRoot(),
) {
  const session = editSessions.get(editSessionId);
  if (!session) {
    throw new Error('편집 세션을 찾을 수 없습니다.');
  }
  if (session.holderId !== holderId) {
    throw new Error('편집을 종료할 권한이 없습니다.');
  }

  void dataRoot;
  const normalized = session.relativePath;
  const destination = resolvePortablePath(normalized);
  const store = await loadLockStore(portableRoot);
  const lock = store.locks[normalized];
  if (!lock || lock.editSessionId !== editSessionId) {
    throw new Error('잠금 정보가 일치하지 않습니다.');
  }

  let changed = false;
  try {
    const [workingBuffer, destBuffer] = await Promise.all([
      fs.readFile(session.workingPath),
      fs.readFile(destination),
    ]);
    changed = !workingBuffer.equals(destBuffer);
  } catch {
    changed = true;
  }

  if (changed) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(session.workingPath, destination);
    await appendHistorySnapshot(destination, historyDir(portableRoot, normalized), {
      label: '편집 후',
      kind: 'session-end',
      userName: session.userName,
    });
  }

  delete store.locks[normalized];
  await saveLockStore(portableRoot, store);

  editSessions.delete(editSessionId);
  await fs.rm(session.sessionDir, { recursive: true, force: true });

  return { relativePath: normalized, changed };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncHwpxLockRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  const from = normalizePath(fromRelative);
  const to = normalizePath(toRelative);
  const store = await loadLockStore(portableRoot);
  if (!store.locks[from]) return;

  store.locks[to] = store.locks[from];
  delete store.locks[from];
  await saveLockStore(portableRoot, store);

  for (const session of editSessions.values()) {
    if (session.relativePath === from) {
      session.relativePath = to;
    }
  }

  const fromDir = historyDir(portableRoot, from);
  const toDir = historyDir(portableRoot, to);
  try {
    await fs.access(fromDir);
    await fs.mkdir(path.dirname(toDir), { recursive: true });
    await fs.rename(fromDir, toDir);
  } catch {
    // no history dir
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncHwpxLockDelete(relativePath, portableRoot = getPortableRoot()) {
  const normalized = normalizePath(relativePath);
  const store = await loadLockStore(portableRoot);
  let changed = false;
  for (const key of Object.keys(store.locks)) {
    if (key === normalized || key.startsWith(`${normalized}/`)) {
      const lock = store.locks[key];
      if (lock) editSessions.delete(lock.editSessionId);
      delete store.locks[key];
      changed = true;
    }
  }
  if (changed) await saveLockStore(portableRoot, store);

  const historyRoot = path.join(portableRoot, HISTORY_ROOT);
  await fs.rm(historyDir(portableRoot, normalized), { recursive: true, force: true }).catch(() => {});
  let entries;
  try {
    entries = await fs.readdir(historyRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let filePath = '';
    try {
      filePath = Buffer.from(entry.name, 'base64url').toString('utf8');
    } catch {
      continue;
    }
    const key = normalizePath(filePath);
    if (key !== normalized && !key.startsWith(`${normalized}/`)) continue;
    await fs.rm(path.join(historyRoot, entry.name), { recursive: true, force: true }).catch(() => {});
  }
}
