import { compareNames } from './fsPaths.js';
import { isFavoritesRelativePath } from '../../shared/constants.js';
import { isTiptapAssetSidecarRelativePath } from '../../shared/tiptapAssetPaths.js';
import { isFortuneSidecarRelativePath } from '../../shared/fortuneSheetSidecar.js';
import { isPdfViewerSidecarRelativePath } from '../../shared/pdfViewerSidecar.js';
import { isExternalFolderPath } from '../../shared/externalFolders.js';

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 */
function shouldSkipSearchEntry(entry) {
  if (isTiptapAssetSidecarRelativePath(entry.relativePath)) return true;
  if (isFortuneSidecarRelativePath(entry.relativePath)) return true;
  if (isPdfViewerSidecarRelativePath(entry.relativePath)) return true;
  if (isExternalFolderPath(entry.relativePath)) return true;
  if (isFavoritesRelativePath(entry.relativePath)) return true;
  return false;
}

/**
 * @param {string} query
 * @param {{ maxResults?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ entries: import('../types/nas4usb.d.ts').FsEntry[], truncated: boolean }>}
 */
export async function searchFileEntries(query, { maxResults = 200, signal } = {}) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { entries: [], truncated: false };
  }

  /** @type {import('../types/nas4usb.d.ts').FsEntry[]} */
  const results = [];
  let truncated = false;

  /**
   * Match files in the current folder before descending, so sibling files
   * are not crowded out by a deep folder tree (200-result cap).
   * @param {string} relativePath
   */
  async function walk(relativePath) {
    if (signal?.aborted || truncated) return;

    /** @type {import('../types/nas4usb.d.ts').FsEntry[]} */
    let entries = [];
    try {
      entries = await window.nas4usb.fs.readDir(relativePath);
    } catch {
      return;
    }

    const files = [];
    const folders = [];
    for (const entry of entries) {
      if (shouldSkipSearchEntry(entry)) continue;
      if (entry.isDirectory) folders.push(entry);
      else files.push(entry);
    }

    for (const entry of [...files, ...folders]) {
      if (signal?.aborted || truncated) return;
      if (!entry.name.toLowerCase().includes(normalized)) continue;
      results.push(entry);
      if (results.length >= maxResults) {
        truncated = true;
        return;
      }
    }

    for (const folder of folders) {
      if (signal?.aborted || truncated) return;
      await walk(folder.relativePath);
    }
  }

  await walk('.');
  results.sort((left, right) => compareNames(left.name, right.name));
  return { entries: results, truncated };
}
