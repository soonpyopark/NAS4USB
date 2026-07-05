import { canEditFileEntry, canViewFileEntry } from '../../shared/fileAccessVisibility.js';

export const EDIT_OPEN_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';
export const VIEW_OPEN_DENIED_MESSAGE = '이 파일을 열 수 없습니다.';

/**
 * 목록에 보이는 파일은 열기(열람) 가능. 저장·편집 제한은 서버 assertCanEditFile에서 처리.
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn
 */
export function canOpenFileForEdit(relativePath, accessMap, isAdminLoggedIn) {
  return canViewFileEntry(relativePath, accessMap, isAdminLoggedIn);
}

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn
 */
export function canSaveFileEdits(relativePath, accessMap, isAdminLoggedIn) {
  return canEditFileEntry(relativePath, accessMap, isAdminLoggedIn);
}
