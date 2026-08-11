import {
  DEFAULT_DATA_DIR,
  LEGACY_SHARED_DISK_DIR,
  SHARED_FOLDER,
  TRASH_FOLDER,
  FAVORITES_FOLDER,
} from './constants.js';
import {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  LEGACY_HOMES_DISK_DIR,
  LEGACY_HOMES_FOLDER,
  normalizeRelativePath,
} from './memberHomes.js';

/**
 * @param {string} relativePath
 */
export function isSharedFolderPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return (
    normalized === SHARED_FOLDER || normalized.startsWith(`${SHARED_FOLDER}/`)
  );
}

/**
 * @param {string} relativePath
 */
export function isProtectedSharedSystemPath(relativePath) {
  return normalizeRelativePath(relativePath) === SHARED_FOLDER;
}

/**
 * Workspace root (`.`) is virtual: only 공유폴더 + 개인폴더.
 * @param {string} relativePath
 */
export function isWorkspaceRootPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return !normalized || normalized === '.';
}

/**
 * Map legacy relative paths into the workspace model:
 * - `__homes/...` / `private/...` → `개인폴더/...`
 * - `share/...` (disk name) → `공유폴더/...`
 * - unprefixed shared paths → `공유폴더/...`
 * - `__trash`, `__favorites`, already-prefixed paths unchanged
 *
 * @param {string} relativePath
 */
export function toCanonicalWorkspacePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return normalized || '.';

  if (
    normalized === TRASH_FOLDER ||
    normalized.startsWith(`${TRASH_FOLDER}/`) ||
    normalized === FAVORITES_FOLDER ||
    normalized.startsWith(`${FAVORITES_FOLDER}/`)
  ) {
    return normalized;
  }

  if (
    normalized === HOMES_FOLDER ||
    normalized.startsWith(`${HOMES_FOLDER}/`)
  ) {
    return normalized;
  }

  if (
    normalized === LEGACY_HOMES_FOLDER ||
    normalized.startsWith(`${LEGACY_HOMES_FOLDER}/`)
  ) {
    return `${HOMES_FOLDER}${normalized.slice(LEGACY_HOMES_FOLDER.length)}`;
  }

  if (
    normalized === HOMES_DISK_DIR ||
    normalized.startsWith(`${HOMES_DISK_DIR}/`)
  ) {
    return `${HOMES_FOLDER}${normalized.slice(HOMES_DISK_DIR.length)}`;
  }

  if (
    normalized === LEGACY_HOMES_DISK_DIR ||
    normalized.startsWith(`${LEGACY_HOMES_DISK_DIR}/`)
  ) {
    return `${HOMES_FOLDER}${normalized.slice(LEGACY_HOMES_DISK_DIR.length)}`;
  }

  if (
    normalized === SHARED_FOLDER ||
    normalized.startsWith(`${SHARED_FOLDER}/`)
  ) {
    return normalized;
  }

  if (
    normalized === DEFAULT_DATA_DIR ||
    normalized.startsWith(`${DEFAULT_DATA_DIR}/`)
  ) {
    return `${SHARED_FOLDER}${normalized.slice(DEFAULT_DATA_DIR.length)}`;
  }

  if (
    normalized === LEGACY_SHARED_DISK_DIR ||
    normalized.startsWith(`${LEGACY_SHARED_DISK_DIR}/`)
  ) {
    return `${SHARED_FOLDER}${normalized.slice(LEGACY_SHARED_DISK_DIR.length)}`;
  }

  return `${SHARED_FOLDER}/${normalized}`;
}

/**
 * @param {string} relativePath
 * @returns {{ kind: 'shared' | 'homes' | 'trash' | 'favorites' | 'workspace' | 'legacy-shared', rest: string }}
 */
export function splitWorkspacePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') {
    return { kind: 'workspace', rest: '' };
  }
  if (normalized === TRASH_FOLDER || normalized.startsWith(`${TRASH_FOLDER}/`)) {
    return {
      kind: 'trash',
      rest: normalized === TRASH_FOLDER ? '' : normalized.slice(TRASH_FOLDER.length + 1),
    };
  }
  if (
    normalized === FAVORITES_FOLDER ||
    normalized.startsWith(`${FAVORITES_FOLDER}/`)
  ) {
    return {
      kind: 'favorites',
      rest:
        normalized === FAVORITES_FOLDER
          ? ''
          : normalized.slice(FAVORITES_FOLDER.length + 1),
    };
  }
  if (normalized === HOMES_FOLDER || normalized.startsWith(`${HOMES_FOLDER}/`)) {
    return {
      kind: 'homes',
      rest: normalized === HOMES_FOLDER ? '' : normalized.slice(HOMES_FOLDER.length + 1),
    };
  }
  if (
    normalized === LEGACY_HOMES_FOLDER ||
    normalized.startsWith(`${LEGACY_HOMES_FOLDER}/`)
  ) {
    return {
      kind: 'homes',
      rest:
        normalized === LEGACY_HOMES_FOLDER
          ? ''
          : normalized.slice(LEGACY_HOMES_FOLDER.length + 1),
    };
  }
  if (normalized === HOMES_DISK_DIR || normalized.startsWith(`${HOMES_DISK_DIR}/`)) {
    return {
      kind: 'homes',
      rest:
        normalized === HOMES_DISK_DIR ? '' : normalized.slice(HOMES_DISK_DIR.length + 1),
    };
  }
  if (
    normalized === LEGACY_HOMES_DISK_DIR ||
    normalized.startsWith(`${LEGACY_HOMES_DISK_DIR}/`)
  ) {
    return {
      kind: 'homes',
      rest:
        normalized === LEGACY_HOMES_DISK_DIR
          ? ''
          : normalized.slice(LEGACY_HOMES_DISK_DIR.length + 1),
    };
  }
  if (normalized === SHARED_FOLDER || normalized.startsWith(`${SHARED_FOLDER}/`)) {
    return {
      kind: 'shared',
      rest: normalized === SHARED_FOLDER ? '' : normalized.slice(SHARED_FOLDER.length + 1),
    };
  }
  if (
    normalized === DEFAULT_DATA_DIR ||
    normalized.startsWith(`${DEFAULT_DATA_DIR}/`)
  ) {
    return {
      kind: 'shared',
      rest:
        normalized === DEFAULT_DATA_DIR
          ? ''
          : normalized.slice(DEFAULT_DATA_DIR.length + 1),
    };
  }
  return { kind: 'legacy-shared', rest: normalized };
}
