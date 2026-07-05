/**
 * @param {{ visibility?: string, viewRestricted?: boolean } | undefined} record
 * @returns {{ visibility: 'public' | 'private', viewRestricted: boolean }}
 */
export function normalizeFileAccessRecord(record) {
  return {
    visibility: record?.visibility === 'private' ? 'private' : 'public',
    viewRestricted: Boolean(record?.viewRestricted),
  };
}

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn 총괄관리자 로그인 여부
 */
export function canViewFileEntry(relativePath, accessMap, isAdminLoggedIn) {
  const access = normalizeFileAccessRecord(accessMap[relativePath]);
  if (access.viewRestricted && !isAdminLoggedIn) return false;
  if (access.visibility === 'private' && !isAdminLoggedIn) return false;
  return true;
}

/**
 * 공개 문서: visibility가 public이고 열람제한이 없음
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 */
export function isPublicDocument(relativePath, accessMap) {
  const access = normalizeFileAccessRecord(accessMap[relativePath]);
  return access.visibility === 'public' && !access.viewRestricted;
}

/**
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn
 */
export function canEditFileEntry(relativePath, accessMap, isAdminLoggedIn) {
  if (isAdminLoggedIn) return true;
  return isPublicDocument(relativePath, accessMap);
}

/**
 * @param {Array<{ relativePath: string, isDirectory?: boolean }>} entries
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn
 */
export function filterEntriesByFileAccess(entries, accessMap, isAdminLoggedIn) {
  if (isAdminLoggedIn) return entries;
  return entries.filter(
    (entry) => entry.isDirectory || canViewFileEntry(entry.relativePath, accessMap, isAdminLoggedIn),
  );
}

/**
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} isAdminLoggedIn
 */
export function filterFileAccessMap(accessMap, isAdminLoggedIn) {
  if (isAdminLoggedIn) return accessMap;
  /** @type {Record<string, { visibility?: string, viewRestricted?: boolean }>} */
  const filtered = {};
  for (const [relativePath, record] of Object.entries(accessMap)) {
    if (canViewFileEntry(relativePath, accessMap, isAdminLoggedIn)) {
      filtered[relativePath] = record;
    }
  }
  return filtered;
}
