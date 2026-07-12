import { canEditFileEntry, canViewFileEntry } from '../../shared/fileAccessVisibility.js';
import { DEFAULT_GUEST_PERMISSIONS } from '../../shared/guestPermissions.js';

export const EDIT_OPEN_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';
export const VIEW_OPEN_DENIED_MESSAGE = '이 파일을 열 수 없습니다.';
export const GUEST_READ_DENIED_MESSAGE = '읽기 권한이 없습니다.';
export const GUEST_WRITE_DENIED_MESSAGE = '쓰기 권한이 없습니다.';

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} _isAdminLoggedIn unused — effective flags already selected by caller
 * @param {{ view?: boolean, read?: boolean, write?: boolean }} [permissions]
 */
export function canOpenFileForEdit(
  relativePath,
  accessMap,
  _isAdminLoggedIn,
  permissions = DEFAULT_GUEST_PERMISSIONS,
) {
  const elevatedAccess = Boolean(permissions?.write);
  if (elevatedAccess) {
    return canViewFileEntry(relativePath, accessMap, true);
  }
  if (permissions?.read === false) return false;
  return canViewFileEntry(relativePath, accessMap, false);
}

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} _isAdminLoggedIn
 * @param {{ view?: boolean, read?: boolean, write?: boolean }} [permissions]
 */
export function canSaveFileEdits(
  relativePath,
  accessMap,
  _isAdminLoggedIn,
  permissions = DEFAULT_GUEST_PERMISSIONS,
) {
  const elevatedAccess = Boolean(permissions?.write);
  if (elevatedAccess) {
    return canEditFileEntry(relativePath, accessMap, true);
  }
  return false;
}
