import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataRoot, getPortableRoot } from './appContext.js';
import { purgeYjsRoomForPath } from './yjsRoom.js';
import { getFortuneSidecarPath } from '../shared/fortuneSheetSidecar.js';

/** Root for revision-history storage, kept outside the data root so it never shows up in the file explorer. */
const HISTORY_ROOT = '.nas4usb/file-history';
const MAX_HISTORY_ENTRIES = 10;
const SNAPSHOT_ID_PATTERN = /^[0-9a-f-]{36}$/i;

/** Extensions covered by the "백업보기" feature (the modal editors that have a Save button). */
const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xls', 'hwpx', 'txt', 'md', 'tiptap']);

/**
 * `.xlsx`/`.xls` extras that only FortuneSheet understands (currently: inserted images — see
 * `insertImage`/`saveImage` in @fortune-sheet/core) live in the `.fortune.json` sidecar, never in
 * the plain XLSX bytes themselves (the bundled `xlsx` library has no drawing/image write support).
 * Snapshotting only the raw XLSX file therefore silently drops images from history. Snapshot the
 * sidecar alongside so preview/restore can recover full fidelity when it's available.
 */
const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);

/**
 * @param {string} relativePath
 */
function normalizePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
function getExtension(relativePath) {
  const name = normalizePath(relativePath).split('/').pop() ?? '';
  const index = name.lastIndexOf('.');
  if (index <= 0) return '';
  return name.slice(index + 1).toLowerCase();
}

/**
 * @param {string} relativePath
 */
export function isFileHistorySupported(relativePath) {
  return SUPPORTED_EXTENSIONS.has(getExtension(relativePath));
}

/**
 * @param {string} relativePath
 */
function hasFortuneSidecar(relativePath) {
  return SPREADSHEET_EXTENSIONS.has(getExtension(relativePath));
}

/**
 * @param {string} dir
 * @param {string} entryId
 */
function sidecarSnapshotPath(dir, entryId) {
  return path.join(dir, `${entryId}.sidecar.json`);
}

/**
 * @param {string} relativePath
 */
function encodeHistoryKey(relativePath) {
  return Buffer.from(normalizePath(relativePath), 'utf8').toString('base64url');
}

/**
 * @param {string} portableRoot
 * @param {string} relativePath
 */
function historyDir(portableRoot, relativePath) {
  return path.join(portableRoot, HISTORY_ROOT, encodeHistoryKey(relativePath));
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
    // ignore — no history yet
  }
  return { entries: [] };
}

/**
 * @param {string} dir
 * @param {{ entries: Array<{ id: string, createdAt: string, size: number }> }} manifest
 */
async function saveHistoryManifest(dir, manifest) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * @param {string} entryId
 */
function assertValidEntryId(entryId) {
  if (!SNAPSHOT_ID_PATTERN.test(String(entryId ?? ''))) {
    throw new Error('이력을 찾을 수 없습니다.');
  }
}

/**
 * Archive the bytes currently at `sourcePath` as a new history entry, pruning to MAX_HISTORY_ENTRIES.
 * @param {string} sourcePath
 * @param {string} dir
 */
async function appendHistorySnapshot(sourcePath, dir) {
  await fs.mkdir(dir, { recursive: true });
  const manifest = await loadHistoryManifest(dir);
  const stat = await fs.stat(sourcePath);
  const id = crypto.randomUUID();
  const entry = { id, createdAt: new Date().toISOString(), size: stat.size };

  await fs.copyFile(sourcePath, path.join(dir, `${id}.snapshot`));
  manifest.entries.unshift(entry);

  while (manifest.entries.length > MAX_HISTORY_ENTRIES) {
    const removed = manifest.entries.pop();
    if (removed?.id) {
      await fs.rm(path.join(dir, `${removed.id}.snapshot`), { force: true });
      await fs.rm(sidecarSnapshotPath(dir, removed.id), { force: true });
    }
  }

  await saveHistoryManifest(dir, manifest);
  return entry;
}

/**
 * Called right before a save overwrites the destination file — archives what is
 * currently on disk (if any) so it becomes a restorable history entry.
 * @param {string} relativePath
 * @param {string} [dataRoot]
 * @param {string} [portableRoot]
 */
export async function archiveCurrentVersion(relativePath, dataRoot = getDataRoot(), portableRoot = getPortableRoot()) {
  const normalized = normalizePath(relativePath);
  if (!isFileHistorySupported(normalized)) return null;

  const destination = path.join(dataRoot, normalized);
  try {
    await fs.access(destination);
  } catch {
    return null; // nothing on disk yet (first save of a new file)
  }

  const dir = historyDir(portableRoot, normalized);
  const entry = await appendHistorySnapshot(destination, dir);

  // Must run *before* the caller overwrites the live sidecar with the new save's content —
  // callers are responsible for that ordering (see XlsxEditorShell.jsx's handleSave, which
  // archives via commitWorkspace() before it calls writeFortuneSidecar with the new sheets).
  if (hasFortuneSidecar(normalized)) {
    const sidecarPath = path.join(dataRoot, getFortuneSidecarPath(normalized));
    await fs.copyFile(sidecarPath, sidecarSnapshotPath(dir, entry.id)).catch(() => {
      // No sidecar yet (plain xlsx never opened in the editor, or no images ever inserted) —
      // fine, preview/restore will fall back to parsing the plain xlsx bytes.
    });
  }

  return entry;
}

/**
 * Full-fidelity FortuneSheet sheets (including inserted images) for a history entry, if the
 * entry has an archived `.fortune.json` sidecar snapshot. Returns null when unavailable (older
 * entries predating this feature, or a plain xlsx that never had a sidecar to begin with) — the
 * caller should fall back to parsing the plain XLSX bytes in that case.
 * @param {string} relativePath
 * @param {string} entryId
 * @param {string} [portableRoot]
 * @returns {Promise<import('@fortune-sheet/core').Sheet[] | null>}
 */
export async function readFileHistorySidecarSheets(relativePath, entryId, portableRoot = getPortableRoot()) {
  assertValidEntryId(entryId);
  const dir = historyDir(portableRoot, normalizePath(relativePath));
  try {
    const raw = await fs.readFile(sidecarSnapshotPath(dir, entryId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sheets) && parsed.sheets.length > 0 ? parsed.sheets : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function listFileHistory(relativePath, portableRoot = getPortableRoot()) {
  const dir = historyDir(portableRoot, normalizePath(relativePath));
  const manifest = await loadHistoryManifest(dir);
  return manifest.entries;
}

/**
 * @param {string} relativePath
 * @param {string} entryId
 * @param {string} [portableRoot]
 */
export async function readFileHistoryBase64(relativePath, entryId, portableRoot = getPortableRoot()) {
  assertValidEntryId(entryId);
  const dir = historyDir(portableRoot, normalizePath(relativePath));
  const manifest = await loadHistoryManifest(dir);
  if (!manifest.entries.some((entry) => entry.id === entryId)) {
    throw new Error('이력을 찾을 수 없습니다.');
  }
  const buffer = await fs.readFile(path.join(dir, `${entryId}.snapshot`));
  return buffer.toString('base64');
}

/**
 * @param {string} relativePath
 * @param {string} entryId
 * @param {string} [portableRoot]
 */
export async function deleteFileHistoryEntry(relativePath, entryId, portableRoot = getPortableRoot()) {
  assertValidEntryId(entryId);
  const dir = historyDir(portableRoot, normalizePath(relativePath));
  const manifest = await loadHistoryManifest(dir);
  const nextEntries = manifest.entries.filter((entry) => entry.id !== entryId);
  if (nextEntries.length === manifest.entries.length) {
    throw new Error('이력을 찾을 수 없습니다.');
  }

  await fs.rm(path.join(dir, `${entryId}.snapshot`), { force: true });
  await fs.rm(sidecarSnapshotPath(dir, entryId), { force: true });
  await saveHistoryManifest(dir, { entries: nextEntries });
  return { ok: true };
}

/**
 * Restore a historical snapshot over the current file, then purge any live Yjs
 * room so peers re-bootstrap from the restored disk content. Does NOT archive the
 * pre-restore state — history entries are only ever created by an explicit save
 * (via commitWorkspace/archiveCurrentVersion), never as a side effect of restoring.
 * @param {string} relativePath
 * @param {string} entryId
 * @param {string} [dataRoot]
 * @param {string} [portableRoot]
 */
export async function restoreFileHistoryEntry(
  relativePath,
  entryId,
  dataRoot = getDataRoot(),
  portableRoot = getPortableRoot(),
) {
  assertValidEntryId(entryId);
  const normalized = normalizePath(relativePath);
  const dir = historyDir(portableRoot, normalized);
  const snapshotPath = path.join(dir, `${entryId}.snapshot`);

  const manifest = await loadHistoryManifest(dir);
  if (!manifest.entries.some((entry) => entry.id === entryId)) {
    throw new Error('복원할 이력을 찾을 수 없습니다.');
  }

  const destination = path.join(dataRoot, normalized);

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(snapshotPath, destination);

  // Full-fidelity sheets (with any inserted images) if this entry has one — the caller should
  // write these straight into the live sidecar instead of re-deriving sheets from the plain
  // XLSX bytes above, which can never recover images (see readFileHistorySidecarSheets).
  const sidecarSheets = hasFortuneSidecar(normalized)
    ? await readFileHistorySidecarSheets(normalized, entryId, portableRoot)
    : null;

  purgeYjsRoomForPath(normalized);

  const base64 = await fs.readFile(destination).then((buffer) => buffer.toString('base64'));
  return { relativePath: normalized, base64, sidecarSheets };
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
async function moveHistoryDirIfExists(fromRelative, toRelative, portableRoot) {
  const fromDir = historyDir(portableRoot, fromRelative);
  const toDir = historyDir(portableRoot, toRelative);
  if (fromDir === toDir) return;
  try {
    await fs.access(fromDir);
  } catch {
    return;
  }
  await fs.mkdir(path.dirname(toDir), { recursive: true });
  await fs.rm(toDir, { recursive: true, force: true });
  await fs.rename(fromDir, toDir);
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [portableRoot]
 */
export async function syncFileHistoryRename(fromRelative, toRelative, portableRoot = getPortableRoot()) {
  await moveHistoryDirIfExists(normalizePath(fromRelative), normalizePath(toRelative), portableRoot);
}

/**
 * Relocate history dirs when a file or folder tree moves (e.g. trash/restore).
 * @param {string} fromRelative
 * @param {string} toRelative
 * @param {string} [dataRoot]
 * @param {string} [portableRoot]
 */
export async function syncFileHistoryMoveTree(
  fromRelative,
  toRelative,
  dataRoot = getDataRoot(),
  portableRoot = getPortableRoot(),
) {
  const fromPath = normalizePath(fromRelative);
  const toPath = normalizePath(toRelative);

  // Single file (has a history dir of its own, or looks like a supported extension).
  await moveHistoryDirIfExists(fromPath, toPath, portableRoot);

  /**
   * @param {string} absoluteDir
   * @param {string} relativeDir
   */
  async function walk(absoluteDir, relativeDir) {
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const abs = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        await walk(abs, rel);
        continue;
      }

      if (!isFileHistorySupported(rel)) continue;
      const fileFrom = `${fromPath}/${rel}`;
      const fileTo = `${toPath}/${rel}`;
      await moveHistoryDirIfExists(fileFrom, fileTo, portableRoot);
    }
  }

  await walk(path.join(dataRoot, fromPath), '');
}

/**
 * @param {string} relativePath
 * @param {string} [portableRoot]
 */
export async function syncFileHistoryDelete(relativePath, portableRoot = getPortableRoot()) {
  const dir = historyDir(portableRoot, normalizePath(relativePath));
  await fs.rm(dir, { recursive: true, force: true });
}
