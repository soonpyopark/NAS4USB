/**
 * @param {{ visibility?: string, viewRestricted?: boolean } | undefined} record
 */
function normalizeFileAccessRecord(record) {
  return {
    visibility: record?.visibility === 'private' ? 'private' : 'public',
    viewRestricted: Boolean(record?.viewRestricted),
  };
}

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {Record<string, { token?: string }>} shareMap
 */
export function resolveFileEntryStatus(relativePath, accessMap, shareMap) {
  const access = normalizeFileAccessRecord(accessMap[relativePath]);
  const sharing = Boolean(shareMap[relativePath]?.token);

  return {
    visibilityLabel: access.visibility === 'private' ? '비' : '공',
    viewLabel: access.viewRestricted ? '열람제한' : '열람허용',
    shareLabel: sharing ? '공유중' : '공유해제',
    isPrivate: access.visibility === 'private',
    isViewRestricted: access.viewRestricted,
    isSharing: sharing,
  };
}
