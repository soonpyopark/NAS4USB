import { sortEntries } from './fsPaths.js';
import { isTiptapAssetSidecarRelativePath } from '../../shared/tiptapAssetPaths.js';
import { isFortuneSidecarRelativePath } from '../../shared/fortuneSheetSidecar.js';
import { isPdfViewerSidecarRelativePath } from '../../shared/pdfViewerSidecar.js';
import { isExternalFolderPath } from '../../shared/externalFolders.js';

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

  async function walk(relativePath) {
    if (signal?.aborted || truncated) return;

    const entries = await window.nas4usb.fs.readDir(relativePath);
    for (const entry of entries) {
      if (signal?.aborted || truncated) return;

      if (isTiptapAssetSidecarRelativePath(entry.relativePath)) continue;
      if (isFortuneSidecarRelativePath(entry.relativePath)) continue;
      if (isPdfViewerSidecarRelativePath(entry.relativePath)) continue;

      // External mounts can be huge (whole drives / cloud sync) — exclude entirely.
      if (isExternalFolderPath(entry.relativePath)) continue;

      if (entry.name.toLowerCase().includes(normalized)) {
        results.push(entry);
        if (results.length >= maxResults) {
          truncated = true;
          return;
        }
      }

      if (entry.isDirectory) {
        await walk(entry.relativePath);
      }
    }
  }

  await walk('.');
  return { entries: sortEntries(results, 'name', 'asc'), truncated };
}
