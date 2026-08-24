import { SHARED_FOLDER } from '../../shared/constants.js';
import { isExternalFolderContainerPath, isExternalFolderPath } from '../../shared/externalFolders.js';
import {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  collapseOwnHomeRootPath,
  folderDisplayDepth,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
  isUnderHomesFolder,
  memberHomeRelativePath,
  normalizeRelativePath,
} from '../../shared/memberHomes.js';
import { getParentPath } from './fsPaths.js';

export {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  collapseOwnHomeRootPath,
  folderDisplayDepth,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
  isUnderHomesFolder,
  memberHomeRelativePath,
};

/**
 * Logged-in members get full V/R/W on their personal home even without global write.
 * @param {string} relativePath
 * @param {string | null | undefined} loginId
 * @param {boolean} isLoggedIn
 * @param {{ view?: boolean, read?: boolean, write?: boolean }} permissions
 * @param {boolean} [isSuperAdmin]
 */
export function effectivePermissionsForPath(
  relativePath,
  loginId,
  isLoggedIn,
  permissions,
  isSuperAdmin = false,
) {
  if (isExternalFolderPath(relativePath)) {
    const allow = Boolean(isSuperAdmin);
    return { view: allow, read: allow, write: allow };
  }
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
 * @param {string} relativePath
 * @param {string | null | undefined} loginId
 */
export function visibleParentPath(relativePath, loginId) {
  return collapseOwnHomeRootPath(getParentPath(relativePath), loginId);
}

/**
 * Toolbar 「백업 일괄 제거」 — 공유폴더 / 개인폴더 trees only.
 * @param {string} currentPath
 */
export function canClearFolderBackups(currentPath) {
  const path = normalizeRelativePath(currentPath);
  if (!path || path === '.') return false;
  if (path === SHARED_FOLDER || path.startsWith(`${SHARED_FOLDER}/`)) return true;
  return isUnderHomesFolder(path);
}

export function canWriteAtPath(currentPath, loginId, isLoggedIn, globalWrite, isSuperAdmin = false) {
  const path = normalizeRelativePath(currentPath);
  if (!path || path === '.') return false;
  if (isHomesContainerPath(path)) return Boolean(isLoggedIn && loginId);
  if (isExternalFolderContainerPath(path)) return false;
  if (isExternalFolderPath(path)) return Boolean(isSuperAdmin);
  if (isLoggedIn && loginId && isOwnMemberHomePath(path, loginId)) return true;
  if (path === SHARED_FOLDER || path.startsWith(`${SHARED_FOLDER}/`)) {
    return Boolean(globalWrite);
  }
  return Boolean(globalWrite);
}
