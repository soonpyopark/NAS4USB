import {
  DEFAULT_DATA_DIR,
  TRASH_FOLDER,
  FAVORITES_FOLDER,
  SHARED_FOLDER,
  isTrashRelativePath,
} from '../../shared/constants.js';
import { HOMES_DISK_DIR, HOMES_FOLDER } from './memberHomes.js';

export { TRASH_FOLDER, FAVORITES_FOLDER, SHARED_FOLDER };

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

/** A stale path that now points at a file — treat like a missing folder. */
/** @param {unknown} error */
export function isFsNotADirectoryError(error) {
  if (!(error instanceof Error)) return false;
  if ('code' in error && error.code === 'ENOTDIR') return true;
  return error.message.includes('ENOTDIR');
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} currentPath
 */
export function filterTrashFromEntries(entries, currentPath) {
  const normalized = String(currentPath ?? '').replace(/\\/g, '/');
  if (normalized !== '.' && normalized !== SHARED_FOLDER) return entries;
  return entries.filter((entry) => entry.relativePath !== TRASH_FOLDER && entry.name !== TRASH_FOLDER);
}

/**
 * @param {string} segment
 */
export function formatBreadcrumbSegment(segment) {
  if (segment === TRASH_FOLDER) return '휴지통';
  if (segment === FAVORITES_FOLDER) return '즐겨찾기';
  if (segment === '__folders') return '폴더';
  if (segment === '__files') return '파일';
  if (segment === HOMES_FOLDER || segment === HOMES_DISK_DIR) return HOMES_FOLDER;
  if (segment === SHARED_FOLDER || segment === DEFAULT_DATA_DIR) return SHARED_FOLDER;
  return segment;
}

/**
 * @param {string} trashRelativePath
 * @param {Record<string, { originalPath?: string, deletedAt?: string }>} trashMap
 */
export function getTrashMeta(trashRelativePath, trashMap) {
  return trashMap[normalizeTrashPath(trashRelativePath)] ?? null;
}
