import { SHARED_FOLDER } from '../../shared/constants.js';
import {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  displayHomeEntryName,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
  isUnderHomesFolder,
  memberHomeRelativePath,
  normalizeRelativePath,
  resolveHomePathAccess,
  sanitizeLoginIdForHomeFolder,
} from '../../shared/memberHomes.js';

export {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  SHARED_FOLDER,
  displayHomeEntryName,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
  isUnderHomesFolder,
  memberHomeRelativePath,
  normalizeRelativePath,
  resolveHomePathAccess,
  sanitizeLoginIdForHomeFolder,
};

/**
 * Logged-in members get full V/R/W on their personal home even without global write.
 * @param {string} relativePath
 * @param {string | null | undefined} loginId
 * @param {boolean} isLoggedIn
 * @param {{ view?: boolean, read?: boolean, write?: boolean }} permissions
 */
export function effectivePermissionsForPath(relativePath, loginId, isLoggedIn, permissions) {
  const base = {
    view: permissions?.view !== false,
    read: permissions?.read !== false,
    write: Boolean(permissions?.write),
  };
  if (!isLoggedIn || !loginId) return base;
  if (isOwnMemberHomePath(relativePath, loginId) || isHomesContainerPath(relativePath)) {
    return { view: true, read: true, write: true };
  }
  return base;
}

/**
 * @param {string} currentPath
 * @param {string | null | undefined} loginId
 * @param {boolean} isLoggedIn
 * @param {boolean} globalWrite
 */
export function canWriteAtPath(currentPath, loginId, isLoggedIn, globalWrite) {
  const path = normalizeRelativePath(currentPath);
  if (!path || path === '.') return false;
  if (isHomesContainerPath(path)) return false;
  if (isLoggedIn && loginId && isOwnMemberHomePath(path, loginId)) return true;
  if (path === SHARED_FOLDER || path.startsWith(`${SHARED_FOLDER}/`)) {
    return Boolean(globalWrite);
  }
  return Boolean(globalWrite);
}
