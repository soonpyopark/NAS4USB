import { normalizeFileAccessRecord } from '../../shared/fileAccessVisibility.js';
import { resolveShareLinkMode } from '../../shared/shareLinkModes.js';

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {Record<string, { token?: string, mode?: string }>} shareMap
 * @param {Record<string, boolean>} [favoritesMap]
 */
export function resolveFileEntryStatus(relativePath, accessMap, shareMap, favoritesMap = {}) {
  const access = normalizeFileAccessRecord(accessMap[relativePath]);
  const shareMode = resolveShareLinkMode(shareMap[relativePath]);

  return {
    visibilityLabel: access.visibility === 'private' ? '비' : '공',
    viewLabel: access.viewRestricted ? '열람제한' : '열람허용',
    shareLabel:
      shareMode === 'edit' ? '공유(편집)' : shareMode === 'view' ? '공유(보기)' : '공유해제',
    isPrivate: access.visibility === 'private',
    isViewRestricted: access.viewRestricted,
    shareMode,
    isShareViewOnly: shareMode === 'view',
    isShareEditable: shareMode === 'edit',
    isFavorite: Boolean(favoritesMap[relativePath]),
  };
}
