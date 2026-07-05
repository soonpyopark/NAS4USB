import { sortEntries } from './fsPaths.js';

/**
 * @param {string} query
 * @param {{ maxResults?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ entries: import('../types/educowork.d.ts').FsEntry[], truncated: boolean }>}
 */
export async function searchFileEntries(query, { maxResults = 200, signal } = {}) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { entries: [], truncated: false };
  }

  /** @type {import('../types/educowork.d.ts').FsEntry[]} */
  const results = [];
  let truncated = false;

  async function walk(relativePath) {
    if (signal?.aborted || truncated) return;

    const entries = await window.educowork.fs.readDir(relativePath);
    for (const entry of entries) {
      if (signal?.aborted || truncated) return;

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
