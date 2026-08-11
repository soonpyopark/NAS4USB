/**
 * Per-member personal folders — sibling of the shared folder (share),
 * not nested inside it. Guests do not get a home.
 * Virtual/UI path stays `개인폴더`; on-disk container is `private`.
 */

/** Virtual / UI container folder name (sibling of 공유폴더 in the explorer). */
export const HOMES_FOLDER = '개인폴더';

/** On-disk personal-folders container (sibling of share/). */
export const HOMES_DISK_DIR = 'private';

/** Previous homes container nested under the data/shared root. */
export const LEGACY_HOMES_FOLDER = '__homes';

/** Previous Korean on-disk sibling name. */
export const LEGACY_HOMES_DISK_DIR = '개인폴더';

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Sanitize loginId for use as a single path segment (Windows-safe).
 * @param {string} loginId
 */
export function sanitizeLoginIdForHomeFolder(loginId) {
  const trimmed = String(loginId ?? '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\.+$/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return '';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    return `_${cleaned}`;
  }
  return cleaned.slice(0, 80);
}

/**
 * @param {string} loginId
 * @returns {string | null} relative path like `개인폴더/admin`, or null if invalid
 */
export function memberHomeRelativePath(loginId) {
  const folder = sanitizeLoginIdForHomeFolder(loginId);
  if (!folder) return null;
  return `${HOMES_FOLDER}/${folder}`;
}

/**
 * @param {string} relativePath
 */
export function isHomesContainerPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return (
    normalized === HOMES_FOLDER ||
    normalized === LEGACY_HOMES_FOLDER ||
    normalized === HOMES_DISK_DIR ||
    normalized === LEGACY_HOMES_DISK_DIR
  );
}

/**
 * @param {string} relativePath
 */
export function isUnderHomesFolder(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return (
    normalized === HOMES_FOLDER ||
    normalized.startsWith(`${HOMES_FOLDER}/`) ||
    normalized === LEGACY_HOMES_FOLDER ||
    normalized.startsWith(`${LEGACY_HOMES_FOLDER}/`) ||
    normalized === HOMES_DISK_DIR ||
    normalized.startsWith(`${HOMES_DISK_DIR}/`) ||
    normalized === LEGACY_HOMES_DISK_DIR ||
    normalized.startsWith(`${LEGACY_HOMES_DISK_DIR}/`)
  );
}

/**
 * @param {string} relativePath
 * @returns {string | null}
 */
export function getHomeOwnerFolderFromPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  let rest = '';
  if (normalized.startsWith(`${HOMES_FOLDER}/`)) {
    rest = normalized.slice(HOMES_FOLDER.length + 1);
  } else if (normalized.startsWith(`${LEGACY_HOMES_FOLDER}/`)) {
    rest = normalized.slice(LEGACY_HOMES_FOLDER.length + 1);
  } else if (normalized.startsWith(`${HOMES_DISK_DIR}/`)) {
    rest = normalized.slice(HOMES_DISK_DIR.length + 1);
  } else if (normalized.startsWith(`${LEGACY_HOMES_DISK_DIR}/`)) {
    rest = normalized.slice(LEGACY_HOMES_DISK_DIR.length + 1);
  } else {
    return null;
  }
  const owner = rest.split('/')[0] || '';
  return owner || null;
}

/**
 * @param {string} relativePath
 */
export function isMemberHomeRootPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const owner = getHomeOwnerFolderFromPath(normalized);
  if (!owner) return false;
  return (
    normalized === `${HOMES_FOLDER}/${owner}` ||
    normalized === `${LEGACY_HOMES_FOLDER}/${owner}` ||
    normalized === `${HOMES_DISK_DIR}/${owner}` ||
    normalized === `${LEGACY_HOMES_DISK_DIR}/${owner}`
  );
}

/**
 * @param {string} relativePath
 * @param {string | null | undefined} loginId
 */
export function isOwnMemberHomePath(relativePath, loginId) {
  const ownerFolder = getHomeOwnerFolderFromPath(relativePath);
  if (!ownerFolder) return false;
  const mine = sanitizeLoginIdForHomeFolder(loginId ?? '');
  if (!mine) return false;
  return ownerFolder.toLowerCase() === mine.toLowerCase();
}

/**
 * @typedef {{
 *   isLoggedIn?: boolean,
 *   loginId?: string | null,
 *   role?: string | null,
 * } | boolean} HomeAccessAuth
 */

/**
 * @param {HomeAccessAuth} auth
 * @returns {{ isLoggedIn: boolean, loginId: string | null, isSuperAdmin: boolean }}
 */
export function resolveHomeAuth(auth) {
  if (typeof auth === 'boolean') {
    return { isLoggedIn: auth, loginId: null, isSuperAdmin: false };
  }
  return {
    isLoggedIn: Boolean(auth?.isLoggedIn),
    loginId: auth?.loginId ? String(auth.loginId) : null,
    isSuperAdmin: auth?.role === 'super_admin',
  };
}

/**
 * @param {string} relativePath
 * @param {HomeAccessAuth} auth
 * @returns {'allow' | 'deny' | 'pass'}
 */
export function resolveHomePathAccess(relativePath, auth) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.' || !isUnderHomesFolder(normalized)) {
    return 'pass';
  }

  const { isLoggedIn, loginId, isSuperAdmin } = resolveHomeAuth(auth);
  if (!isLoggedIn) return 'deny';
  if (isSuperAdmin) return 'allow';

  if (isHomesContainerPath(normalized)) return 'allow';

  if (isOwnMemberHomePath(normalized, loginId)) return 'allow';
  return 'deny';
}

/**
 * @param {Array<{ relativePath: string, isDirectory?: boolean, name?: string }>} entries
 * @param {HomeAccessAuth} auth
 */
export function filterEntriesByMemberHome(entries, auth) {
  const { isLoggedIn, loginId, isSuperAdmin } = resolveHomeAuth(auth);
  return entries.filter((entry) => {
    const path = normalizeRelativePath(entry.relativePath);
    if (!isUnderHomesFolder(path)) return true;
    if (!isLoggedIn) return false;
    if (isSuperAdmin) return true;
    if (isHomesContainerPath(path)) return true;
    return isOwnMemberHomePath(path, loginId);
  });
}

/**
 * @param {string} name
 * @param {string} [relativePath]
 */
export function displayHomeEntryName(name, relativePath) {
  const path = normalizeRelativePath(relativePath ?? name);
  if (
    isHomesContainerPath(path) ||
    name === HOMES_FOLDER ||
    name === LEGACY_HOMES_FOLDER ||
    name === HOMES_DISK_DIR ||
    name === LEGACY_HOMES_DISK_DIR
  ) {
    return HOMES_FOLDER;
  }
  return name;
}

/**
 * @param {string} relativePath
 */
export function isProtectedHomesSystemPath(relativePath) {
  return isHomesContainerPath(relativePath);
}
