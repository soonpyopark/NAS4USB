import {
  canDemoteFile,
  canPromoteFile,
  fileEntriesInOrder,
  planIndentDelta,
} from '../../shared/fileIndent.js';

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {{ relativePath: string, isDirectory?: boolean } | null | undefined} entry
 * @param {Record<string, number>} levelMap
 */
export function canIndentFileDown(entries, entry, levelMap) {
  const files = fileEntriesInOrder(entries);
  const index = files.findIndex((item) => item.relativePath === entry?.relativePath);
  return canDemoteFile(files, index, levelMap);
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {{ relativePath: string, isDirectory?: boolean } | null | undefined} entry
 * @param {Record<string, number>} levelMap
 */
export function canIndentFileUp(entries, entry, levelMap) {
  const files = fileEntriesInOrder(entries);
  const index = files.findIndex((item) => item.relativePath === entry?.relativePath);
  return canPromoteFile(files, index, levelMap);
}

/**
 * @param {{
 *   entries: { relativePath: string, isDirectory?: boolean }[],
 *   entry: { relativePath: string, isDirectory?: boolean } | null | undefined,
 *   delta: 1 | -1,
 *   levelMap: Record<string, number>,
 *   setFileLevels: (entries: { path: string, level: number }[]) => Promise<unknown>,
 * }} options
 */
export async function applyFileIndentDelta({ entries, entry, delta, levelMap, setFileLevels }) {
  const files = fileEntriesInOrder(entries);
  const index = files.findIndex((item) => item.relativePath === entry?.relativePath);
  const planned = planIndentDelta(files, index, delta, levelMap);
  if (planned.length === 0) return false;
  await setFileLevels(planned.map((item) => ({ path: item.path, level: item.level })));
  return true;
}
