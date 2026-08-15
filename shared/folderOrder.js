import { EXTERNAL_FOLDER, SHARED_FOLDER, isFavoritesRelativePath, isTrashRelativePath } from './constants.js';
import { isExternalFolderContainerPath, isExternalMountRootPath } from './externalFolders.js';
import {
  HOMES_FOLDER,
  isHomesContainerPath,
  isOwnMemberHomePath,
  rewritePathIntoOwnHome,
} from './memberHomes.js';

/**
 * @param {string} relativePath
 */
export function normalizeFolderOrderParent(relativePath) {
  const normalized = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return normalized === '' || normalized === '.' ? '.' : normalized;
}

/**
 * UI collapses `개인폴더/{loginId}` to `개인폴더`. Persist and look up
 * order under the real home path so children like 개인노트 keep their order.
 * @param {string} parentPath
 * @param {string | null | undefined} [loginId]
 * @param {string | null | undefined} [sampleChildPath]
 */
export function resolveFolderOrderParent(parentPath, loginId, sampleChildPath) {
  const normalized = normalizeFolderOrderParent(parentPath);
  if (loginId) {
    const rewritten = rewritePathIntoOwnHome(normalized, loginId);
    return normalizeFolderOrderParent(rewritten || normalized);
  }
  if (isHomesContainerPath(normalized) && sampleChildPath) {
    const child = normalizeFolderOrderParent(sampleChildPath);
    const slash = child.lastIndexOf('/');
    if (slash > 0) return child.slice(0, slash);
  }
  return normalized;
}

/**
 * Root system folders and external mounts keep a fixed explorer position.
 * @param {string} relativePath
 */
export function isFixedFolderOrderPath(relativePath) {
  const normalized = normalizeFolderOrderParent(relativePath);
  return (
    normalized === SHARED_FOLDER ||
    normalized === HOMES_FOLDER ||
    normalized === EXTERNAL_FOLDER ||
    isExternalMountRootPath(normalized)
  );
}

/**
 * Custom order can be saved for this folder's children.
 * @param {string} parentPath
 */
export function canPersistFolderOrder(parentPath) {
  const normalized = normalizeFolderOrderParent(parentPath);
  if (normalized === '.') return false;
  if (isExternalFolderContainerPath(normalized)) return false;
  if (isTrashRelativePath(normalized)) return false;
  if (isFavoritesRelativePath(normalized)) return false;
  return true;
}

/**
 * Super-admin can reorder any persistable folder. Members can reorder only
 * inside their own personal home.
 * @param {string} parentPath
 * @param {{ isSuperAdmin?: boolean, loginId?: string | null }} [auth]
 */
export function canChangeFolderOrder(parentPath, auth = {}) {
  const resolved = resolveFolderOrderParent(parentPath, auth.loginId);
  if (!canPersistFolderOrder(resolved)) return false;
  if (auth.isSuperAdmin) return true;
  return Boolean(auth.loginId && isOwnMemberHomePath(resolved, auth.loginId));
}
