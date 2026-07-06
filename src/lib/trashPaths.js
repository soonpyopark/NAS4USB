import { TRASH_FOLDER, isTrashRelativePath } from '../../shared/constants.js';

export { TRASH_FOLDER };

/**
 * @param {string} relativePath
 */
export function normalizeTrashPath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isTrashPath(relativePath) {
  return isTrashRelativePath(relativePath);
}

/**
 * @param {string} relativePath
 */
export function isTrashRoot(relativePath) {
  return normalizeTrashPath(relativePath) === TRASH_FOLDER;
}

/** @param {string} relativePath */
export function isTrashSubfolder(relativePath) {
  return isTrashPath(relativePath) && !isTrashRoot(relativePath);
}

/** @param {unknown} error */
export function isFsNotFoundError(error) {
  if (!(error instanceof Error)) return false;
  if ('code' in error && error.code === 'ENOENT') return true;
  return error.message.includes('ENOENT') || error.message.includes('찾을 수 없');
}

/**
 * @param {import('../types/educowork.d.ts').FsEntry[]} entries
 * @param {string} currentPath
 */
export function filterTrashFromEntries(entries, currentPath) {
  if (currentPath !== '.') return entries;
  return entries.filter((entry) => entry.relativePath !== TRASH_FOLDER);
}

/**
 * @param {string} segment
 */
export function formatBreadcrumbSegment(segment) {
  return segment === TRASH_FOLDER ? '휴지통' : segment;
}

/**
 * @param {string} trashRelativePath
 * @param {Record<string, { originalPath?: string, deletedAt?: string }>} trashMap
 */
export function getTrashMeta(trashRelativePath, trashMap) {
  return trashMap[normalizeTrashPath(trashRelativePath)] ?? null;
}
