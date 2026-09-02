import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot, resolvePortablePath } from './appContext.js';
import * as fsService from './fsService.js';
import { EXTERNAL_FOLDER } from '../shared/constants.js';
import { isExternalFolderPath, joinExternalFolderPath, splitExternalFolderPath } from '../shared/externalFolders.js';
import { getPdfViewerStateCacheDir, normalizeRelativePath } from '../shared/pdfViewerSidecar.js';

const FILE_HISTORY_ROOT = '.nas4usb/file-history';
const HWPX_HISTORY_ROOT = '.nas4usb/hwpx-history';

/**
 * @returns {{
 *   pdfViewerCache: number,
 *   pdfViewerSidecar: number,
 *   fileHistory: number,
 *   hwpxHistory: number,
 *   fortuneSidecar: number,
 *   tiptapAssets: number,
 *   skippedUnreadableMounts: number,
 * }}
 */
function emptyCounts() {
  return {
    pdfViewerCache: 0,
    pdfViewerSidecar: 0,
    fileHistory: 0,
    hwpxHistory: 0,
    fortuneSidecar: 0,
    tiptapAssets: 0,
    skippedUnreadableMounts: 0,
  };
}

/**
 * @param {string} dirName
 */
function decodeHistoryKey(dirName) {
  try {
    return Buffer.from(String(dirName ?? ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

/**
 * @param {string} relativePath
 * @param {string} prefix
 */
function isPathUnderPrefix(relativePath, prefix) {
  const key = normalizeRelativePath(relativePath);
  const pre = normalizeRelativePath(prefix);
  if (!key || !pre || pre === '.') return false;
  return key === pre || key.startsWith(`${pre}/`);
}

/**
 * @param {string} relativePath
 */
function mountIdOf(relativePath) {
  return splitExternalFolderPath(normalizeRelativePath(relativePath))?.mountId ?? '';
}

/** @type {Map<string, boolean>} */
const mountReadableCache = new Map();

/**
 * Mount root only — never walks the tree.
 * @param {string} relativePath
 * @returns {Promise<boolean | null>} true/false if known, null if the mount is offline
 */
async function sourceFileExists(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return false;

  if (isExternalFolderPath(normalized)) {
    const mountId = mountIdOf(normalized);
    if (!mountId) return false;
    if (!mountReadableCache.has(mountId)) {
      const root = joinExternalFolderPath(mountId);
      try {
        await fs.access(resolvePortablePath(root));
        mountReadableCache.set(mountId, true);
      } catch {
        mountReadableCache.set(mountId, false);
      }
    }
    if (!mountReadableCache.get(mountId)) return null;
  }

  return fsService.pathExists(normalized);
}

/**
 * Keep only caches whose source PDF still exists under `prefix`.
 * Missing `sourcePath` or a missing file → delete. Offline mounts are skipped.
 * @param {string} prefix
 */
async function prunePdfViewerCache(prefix) {
  const cacheDir = getPdfViewerStateCacheDir();
  let absDir;
  try {
    absDir = resolvePortablePath(cacheDir);
  } catch {
    return { deleted: 0, skippedUnreadable: 0 };
  }

  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return { deleted: 0, skippedUnreadable: 0 };
  }

  let deleted = 0;
  let skippedUnreadable = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
    const rel = `${cacheDir}/${entry.name}`;

    /** @type {string | null} */
    let sourcePath = null;
    try {
      const raw = await fs.readFile(path.join(absDir, entry.name), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sourcePath === 'string' && parsed.sourcePath.trim()) {
        sourcePath = normalizeRelativePath(parsed.sourcePath);
      }
    } catch {
      sourcePath = null;
    }

    if (!sourcePath || !isPathUnderPrefix(sourcePath, prefix)) {
      await fsService.deletePath(rel).catch(() => {});
      deleted += 1;
      continue;
    }

    const exists = await sourceFileExists(sourcePath);
    if (exists === null) {
      skippedUnreadable += 1;
      continue;
    }
    if (exists) continue;
    await fsService.deletePath(rel).catch(() => {});
    deleted += 1;
  }

  return { deleted, skippedUnreadable };
}

/**
 * @param {string} historyRoot
 * @param {string} prefix
 */
async function pruneOrphanHistoryRoot(historyRoot, prefix) {
  const absRoot = path.join(getPortableRoot(), historyRoot);
  let entries;
  try {
    entries = await fs.readdir(absRoot, { withFileTypes: true });
  } catch {
    return { deleted: 0, skippedUnreadable: 0 };
  }

  const pre = normalizeRelativePath(prefix);
  let deleted = 0;
  let skippedUnreadable = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = normalizeRelativePath(decodeHistoryKey(entry.name));
    if (!filePath || !isPathUnderPrefix(filePath, pre)) continue;

    const exists = await sourceFileExists(filePath);
    if (exists === null) {
      skippedUnreadable += 1;
      continue;
    }
    if (exists) continue;
    await fs.rm(path.join(absRoot, entry.name), { recursive: true, force: true }).catch(() => {});
    deleted += 1;
  }

  return { deleted, skippedUnreadable };
}

function countUnreadableMounts() {
  let n = 0;
  for (const readable of mountReadableCache.values()) {
    if (!readable) n += 1;
  }
  return n;
}

/**
 * PDF hash cache + history only. Does not walk share / personal / external trees.
 * @param {string} prefix
 * @param {{ includePdfCache?: boolean }} [options]
 */
async function clearOrphansByPrefix(prefix, options = {}) {
  mountReadableCache.clear();
  const counts = emptyCounts();
  const pre = normalizeRelativePath(prefix);

  if (options.includePdfCache) {
    const pdf = await prunePdfViewerCache(pre);
    counts.pdfViewerCache = pdf.deleted;
  }

  const fileHistory = await pruneOrphanHistoryRoot(FILE_HISTORY_ROOT, pre);
  const hwpxHistory = await pruneOrphanHistoryRoot(HWPX_HISTORY_ROOT, pre);
  counts.fileHistory = fileHistory.deleted;
  counts.hwpxHistory = hwpxHistory.deleted;
  counts.skippedUnreadableMounts = countUnreadableMounts();
  return counts;
}

/**
 * External mounts: keep PDF caches whose `sourcePath` still exists under 외부폴더/.
 */
export async function clearExternalOrphanCaches() {
  return clearOrphansByPrefix(EXTERNAL_FOLDER, { includePdfCache: true });
}

/**
 * Share / personal: orphan history under this folder only. No tree walk.
 * @param {string} relativePath
 */
export async function clearWorkspaceOrphanCaches(relativePath) {
  return clearOrphansByPrefix(relativePath, { includePdfCache: false });
}

/**
 * @param {string} relativePath
 */
export async function clearOrphanCaches(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (isExternalFolderPath(normalized)) {
    return clearExternalOrphanCaches();
  }
  return clearWorkspaceOrphanCaches(normalized);
}
