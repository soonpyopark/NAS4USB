import fs from 'node:fs/promises';
import path from 'node:path';
import { getExternalFolders, getPortableRoot, resolvePortablePath } from './appContext.js';
import * as fsService from './fsService.js';
import {
  isExternalFolderPath,
  joinExternalFolderPath,
  splitExternalFolderPath,
} from '../shared/externalFolders.js';
import {
  getSpreadsheetPathForFortuneSidecar,
  isFortuneSidecarRelativePath,
} from '../shared/fortuneSheetSidecar.js';
import {
  getPdfPathForViewerSidecar,
  getPdfViewerStateCacheDir,
  getPdfViewerStateCacheKey,
  isPdfDocumentRelativePath,
  isPdfViewerSidecarRelativePath,
  normalizeRelativePath,
} from '../shared/pdfViewerSidecar.js';
import {
  getTiptapPathForAssetSidecar,
  isTiptapAssetSidecarRelativePath,
} from '../shared/tiptapAssetPaths.js';

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

/**
 * @param {Set<string>} unreadableMountIds
 * @param {string} relativePath
 */
function isOnUnreadableMount(unreadableMountIds, relativePath) {
  const mountId = mountIdOf(relativePath);
  return Boolean(mountId && unreadableMountIds.has(mountId));
}

/**
 * @param {string} relativePath
 */
async function removeWorkspacePath(relativePath) {
  await fsService.deletePath(relativePath).catch(() => {});
}

/**
 * @param {string} absDir
 * @param {string} relDir
 * @param {{
 *   seen: Set<string>,
 *   livePdfKeys: Set<string>,
 *   fortuneOrphans: string[],
 *   tiptapOrphans: string[],
 *   pdfSidecarOrphans: string[],
 *   collectPdfKeys?: boolean,
 * }} acc
 */
async function visitTree(absDir, relDir, acc) {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const rel = `${relDir}/${entry.name}`;
    const abs = path.join(absDir, entry.name);
    acc.seen.add(rel);

    if (entry.isDirectory()) {
      if (isTiptapAssetSidecarRelativePath(rel)) {
        const companion = getTiptapPathForAssetSidecar(rel);
        if (companion && !acc.seen.has(companion)) {
          const exists = await fsService.pathExists(companion);
          if (!exists) acc.tiptapOrphans.push(rel);
        }
        continue;
      }
      if (entry.name.startsWith('.')) continue;
      await visitTree(abs, rel, acc);
      continue;
    }

    if (acc.collectPdfKeys && isPdfDocumentRelativePath(rel)) {
      acc.livePdfKeys.add(getPdfViewerStateCacheKey(rel));
      continue;
    }

    if (isPdfViewerSidecarRelativePath(rel)) {
      const pdfPath = getPdfPathForViewerSidecar(rel);
      if (!pdfPath || !(await fsService.pathExists(pdfPath))) {
        acc.pdfSidecarOrphans.push(rel);
      }
      continue;
    }

    if (isFortuneSidecarRelativePath(rel)) {
      const spreadsheet = getSpreadsheetPathForFortuneSidecar(rel);
      if (!spreadsheet || !(await fsService.pathExists(spreadsheet))) {
        acc.fortuneOrphans.push(rel);
      }
    }
  }
}

function emptyScan() {
  return {
    seen: new Set(),
    livePdfKeys: new Set(),
    unreadableMountIds: new Set(),
    fortuneOrphans: [],
    tiptapOrphans: [],
    pdfSidecarOrphans: [],
  };
}

async function scanExternalMounts() {
  const acc = emptyScan();
  acc.collectPdfKeys = true;

  for (const mount of getExternalFolders()) {
    const relRoot = joinExternalFolderPath(mount.id);
    let absRoot;
    try {
      absRoot = resolvePortablePath(relRoot);
      await fs.access(absRoot);
    } catch {
      acc.unreadableMountIds.add(mount.id);
      continue;
    }
    acc.seen.add(relRoot);
    await visitTree(absRoot, relRoot, acc);
  }

  return acc;
}

/**
 * @param {string} relativePath
 */
async function scanWorkspaceTree(relativePath) {
  const acc = emptyScan();
  const relRoot = normalizeRelativePath(relativePath);
  let absRoot;
  try {
    absRoot = resolvePortablePath(relRoot);
    await fs.access(absRoot);
  } catch {
    return acc;
  }
  acc.seen.add(relRoot);
  await visitTree(absRoot, relRoot, acc);
  return acc;
}

/**
 * @param {object} scan
 * @param {Set<string>} scan.livePdfKeys
 * @param {Set<string>} scan.unreadableMountIds
 * @param {Set<string>} scan.seen
 */
async function prunePdfViewerCache(scan) {
  const cacheDir = getPdfViewerStateCacheDir();
  let absDir;
  try {
    absDir = resolvePortablePath(cacheDir);
  } catch {
    return 0;
  }

  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  const mountsReadable = scan.unreadableMountIds.size === 0;
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
    const rel = `${cacheDir}/${entry.name}`;
    const key = entry.name.replace(/\.json$/i, '').toLowerCase();

    /** @type {string | null} */
    let sourcePath = null;
    try {
      const raw = await fs.readFile(path.join(absDir, entry.name), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sourcePath === 'string' && parsed.sourcePath.trim()) {
        sourcePath = normalizeRelativePath(parsed.sourcePath);
      }
    } catch {
      // treat as unkeyed hash cache
    }

    let orphan = false;
    if (sourcePath && isExternalFolderPath(sourcePath)) {
      if (isOnUnreadableMount(scan.unreadableMountIds, sourcePath)) continue;
      orphan = !scan.seen.has(sourcePath) && !(await fsService.pathExists(sourcePath));
    } else if (mountsReadable) {
      orphan = !scan.livePdfKeys.has(key);
    }

    if (!orphan) continue;
    await removeWorkspacePath(rel);
    deleted += 1;
  }

  return deleted;
}

/**
 * @param {string} historyRoot
 * @param {{
 *   prefix?: string,
 *   externalOnly?: boolean,
 *   unreadableMountIds?: Set<string>,
 * }} [options]
 */
async function pruneOrphanHistoryRoot(historyRoot, options = {}) {
  const prefix = options.prefix ? normalizeRelativePath(options.prefix) : '';
  const unreadableMountIds = options.unreadableMountIds ?? new Set();
  const absRoot = path.join(getPortableRoot(), historyRoot);
  let entries;
  try {
    entries = await fs.readdir(absRoot, { withFileTypes: true });
  } catch {
    return 0;
  }

  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = normalizeRelativePath(decodeHistoryKey(entry.name));
    if (!filePath) continue;
    if (options.externalOnly && !isExternalFolderPath(filePath)) continue;
    if (prefix && !isPathUnderPrefix(filePath, prefix)) continue;
    if (isOnUnreadableMount(unreadableMountIds, filePath)) continue;
    if (await fsService.pathExists(filePath)) continue;
    await fs.rm(path.join(absRoot, entry.name), { recursive: true, force: true }).catch(() => {});
    deleted += 1;
  }
  return deleted;
}

/**
 * @param {ReturnType<typeof emptyScan>} scan
 * @param {ReturnType<typeof emptyCounts>} counts
 */
async function applySidecarOrphans(scan, counts) {
  for (const rel of scan.pdfSidecarOrphans) {
    await removeWorkspacePath(rel);
    counts.pdfViewerSidecar += 1;
  }
  for (const rel of scan.fortuneOrphans) {
    await removeWorkspacePath(rel);
    counts.fortuneSidecar += 1;
  }
  for (const rel of scan.tiptapOrphans) {
    await removeWorkspacePath(rel);
    counts.tiptapAssets += 1;
  }
}

/**
 * Remove leftover viewer/editor helpers whose external-folder source is gone.
 * Live files' highlights, sidecars, and history are left alone.
 */
export async function clearExternalOrphanCaches() {
  const counts = emptyCounts();
  const scan = await scanExternalMounts();
  counts.skippedUnreadableMounts = scan.unreadableMountIds.size;
  await applySidecarOrphans(scan, counts);
  counts.pdfViewerCache = await prunePdfViewerCache(scan);
  counts.fileHistory = await pruneOrphanHistoryRoot(FILE_HISTORY_ROOT, {
    externalOnly: true,
    unreadableMountIds: scan.unreadableMountIds,
  });
  counts.hwpxHistory = await pruneOrphanHistoryRoot(HWPX_HISTORY_ROOT, {
    externalOnly: true,
    unreadableMountIds: scan.unreadableMountIds,
  });
  return counts;
}

/**
 * Share / personal tree: sibling sidecars + history whose source file is gone.
 * Does not wipe live backups or the external PDF hash cache.
 * @param {string} relativePath
 */
export async function clearWorkspaceOrphanCaches(relativePath) {
  const counts = emptyCounts();
  const prefix = normalizeRelativePath(relativePath);
  const scan = await scanWorkspaceTree(prefix);
  await applySidecarOrphans(scan, counts);
  counts.fileHistory = await pruneOrphanHistoryRoot(FILE_HISTORY_ROOT, { prefix });
  counts.hwpxHistory = await pruneOrphanHistoryRoot(HWPX_HISTORY_ROOT, { prefix });
  return counts;
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
