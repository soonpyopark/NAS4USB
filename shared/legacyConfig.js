/** Legacy EduCowork config paths — read-only fallback for existing installs. */
export const LEGACY_TRASH_INDEX_FILE = '.educowork-trash.json';
export const LEGACY_FILE_ACCESS_FILE = '.educowork-file-access.json';
export const LEGACY_SHARE_FILE = '.educowork-shares.json';
export const LEGACY_USER_PROFILE_PATH = '.educowork/profile.json';
export const LEGACY_LOCKS_FILE = '.educowork/hwpx-locks.json';
export const LEGACY_HISTORY_ROOT = '.educowork/hwpx-history';

export const LEGACY_ADMIN_ID_STORAGE_KEY = 'educowork.adminSession';
export const LEGACY_ADMIN_TOKEN_STORAGE_KEY = 'educowork.adminToken';
export const LEGACY_SYNC_HOST_STORAGE_KEY = 'educowork.syncHost';

/**
 * @param {Storage | undefined} storage
 * @param {string} key
 * @param {string} legacyKey
 */
export function readStorageWithLegacy(storage, key, legacyKey) {
  if (!storage) return '';
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const legacy = storage.getItem(legacyKey);
    if (!legacy) return '';
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
    return legacy;
  } catch {
    return '';
  }
}
