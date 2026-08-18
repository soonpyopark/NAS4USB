/** Default Y.js WebSocket broker port (LAN sync). */
export const DEFAULT_SYNC_PORT = 3009;

/** Application display version. */
export const APP_VERSION = '1.0.7';

/**
 * Package build id (YYMMDD_HHMMSS) — matches MSI/portable filename suffix.
 * Refreshed by `build:release` / `build:msi` / `build:dist:exe` for update checks
 * when the GitHub tag version is unchanged (same-version republish).
 */
export const APP_BUILD_STAMP = '260818_221649';

/** Application display name. */
export const APP_NAME = 'NAS4USB';

/** Splash / about screen blog link. */
export const APP_BLOG_URL = 'https://note4all.tistory.com';

/** Top bar / window title with subtitle. */
export const APP_NAME_LONG = 'NAS4USB';

/** Sidebar badge label. */
export const APP_ICON_LABEL = 'N$U';

/** Web/Electron UI icon (served from Vite public/). */
export const APP_ICON_URL = '/icon.png';

/** Initial department folder under the shared folder. */
export const DEFAULT_DEPARTMENT_CODE = '0000001';

/** Virtual / UI name for the shared documents folder. */
export const SHARED_FOLDER = '공유폴더';

/** Previous default on-disk names for the shared documents folder. */
export const LEGACY_DATA_DIR = 'data';
export const LEGACY_SHARED_DISK_DIR = '공유폴더';

/** Default on-disk shared-directory name under portable/build root. */
export const DEFAULT_DATA_DIR = 'share';

/** Default administrator credentials (override via `.env`). */
export const DEFAULT_ADMIN_ID = 'admin';
export const DEFAULT_ADMIN_PW = 'admin1234';

/** 7-digit department folder name pattern. */
export const DEPARTMENT_CODE_PATTERN = /^\d{7}$/;

/** Trash folder name under data root (visible in readDir). */
export const TRASH_FOLDER = '__trash';

/** Virtual folder path for the favorites document list in the explorer. */
export const FAVORITES_FOLDER = '__favorites';

/** Favorites split views. Subpaths so every favorites guard keeps working. */
export const FAVORITES_FILES_FOLDER = `${FAVORITES_FOLDER}/__files`;
export const FAVORITES_FOLDERS_FOLDER = `${FAVORITES_FOLDER}/__folders`;

/** Virtual prefix for admin-mounted external folders (no LAN collab). */
export const EXTERNAL_FOLDER = '외부폴더';

/** @param {string} relativePath */
export function isTrashRelativePath(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  return normalized === TRASH_FOLDER || normalized.startsWith(`${TRASH_FOLDER}/`);
}

/** @param {string} relativePath */
export function isFavoritesRelativePath(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  return normalized === FAVORITES_FOLDER || normalized.startsWith(`${FAVORITES_FOLDER}/`);
}

/**
 * Which favorites list a path shows: everything, files only, or folders only.
 *
 * @param {string} relativePath
 * @returns {'all' | 'files' | 'folders' | null}
 */
export function favoritesViewKind(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (normalized === FAVORITES_FILES_FOLDER) return 'files';
  if (normalized === FAVORITES_FOLDERS_FOLDER) return 'folders';
  if (isFavoritesRelativePath(normalized)) return 'all';
  return null;
}

export const TRASH_ACCESS_DENIED_MESSAGE = '휴지통은 총괄관리자만 접근할 수 있습니다.';
