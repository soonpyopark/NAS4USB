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
 * elevatedAccess: 총괄관리자 또는 쓰기 권한이 있는 일반 사용자
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} elevatedAccess
 */
export function canViewFileEntry(relativePath, accessMap, elevatedAccess) {
  if (elevatedAccess) return true;
  const access = normalizeFileAccessRecord(accessMap[relativePath]);
  if (access.viewRestricted) return false;
  if (access.visibility === 'private') return false;
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
 * elevatedAccess: 총괄관리자 또는 쓰기 권한이 있는 일반 사용자
 * @param {string} relativePath
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} elevatedAccess
 */
export function canEditFileEntry(relativePath, accessMap, elevatedAccess) {
  if (elevatedAccess) return true;
  return isPublicDocument(relativePath, accessMap);
}

/**
 * @param {Array<{ relativePath: string, isDirectory?: boolean }>} entries
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} elevatedAccess
 */
export function filterEntriesByFileAccess(entries, accessMap, elevatedAccess) {
  if (elevatedAccess) return entries;
  return entries.filter(
    (entry) => entry.isDirectory || canViewFileEntry(entry.relativePath, accessMap, false),
  );
}

/**
 * @param {Record<string, { visibility?: string, viewRestricted?: boolean }>} accessMap
 * @param {boolean} elevatedAccess
 */
export function filterFileAccessMap(accessMap, elevatedAccess) {
  if (elevatedAccess) return accessMap;
  /** @type {Record<string, { visibility?: string, viewRestricted?: boolean }>} */
  const filtered = {};
  for (const [relativePath, record] of Object.entries(accessMap)) {
    if (canViewFileEntry(relativePath, accessMap, false)) {
      filtered[relativePath] = record;
    }
  }
  return filtered;
}
