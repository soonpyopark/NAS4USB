import { SHARED_FOLDER } from './constants.js';
import { HOMES_FOLDER } from './memberHomes.js';

/** @typedef {'all' | 'share' | 'personal' | 'current'} DocSearchScope */
/** @typedef {'share' | 'personal'} DocIndexScope */

/** @type {DocSearchScope[]} */
export const DOC_SEARCH_SCOPE_ORDER = ['all', 'share', 'personal', 'current'];

export const DOC_SEARCH_SCOPE_LABEL = {
  all: '전체',
  share: '공유',
  personal: '개인',
  current: '현재',
};

/**
 * @param {unknown} value
 * @returns {DocSearchScope}
 */
export function normalizeDocSearchScope(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'share' || raw === 'personal' || raw === 'current' || raw === 'all') return raw;
  return 'all';
}

/**
 * @param {unknown} scopes
 * @returns {Set<DocIndexScope>}
 */
export function normalizeDocIndexScopes(scopes) {
  /** @type {Set<DocIndexScope>} */
  const next = new Set();
  const list = Array.isArray(scopes) ? scopes : [];
  for (const item of list) {
    const raw = String(item ?? '').trim().toLowerCase();
    if (raw === 'share' || raw === 'personal') next.add(raw);
  }
  if (next.size === 0) {
    next.add('share');
    next.add('personal');
  }
  return next;
}

/**
 * Search UI scope → which index DBs to query.
 * `current` still searches both, then the explorer filters to the open folder.
 *
 * @param {DocSearchScope} scope
 * @returns {Set<DocIndexScope>}
 */
export function indexScopesForSearchScope(scope) {
  const normalized = normalizeDocSearchScope(scope);
  if (normalized === 'share') return new Set(['share']);
  if (normalized === 'personal') return new Set(['personal']);
  return new Set(['share', 'personal']);
}

/**
 * @param {string} relativePath
 * @param {DocSearchScope} scope
 * @param {{ currentPath?: string, homePath?: string | null, parentOf?: (path: string) => string }} [options]
 */
export function docHitMatchesSearchScope(relativePath, scope, options = {}) {
  const path = String(relativePath ?? '').replace(/\\/g, '/');
  const normalized = normalizeDocSearchScope(scope);
  if (normalized === 'all') return true;
  if (normalized === 'share') {
    return path === SHARED_FOLDER || path.startsWith(`${SHARED_FOLDER}/`);
  }
  if (normalized === 'personal') {
    return path === HOMES_FOLDER || path.startsWith(`${HOMES_FOLDER}/`);
  }
  if (normalized === 'current') {
    const currentPath = String(options.currentPath ?? '.').replace(/\\/g, '/');
    const homePath = options.homePath ? String(options.homePath).replace(/\\/g, '/') : null;
    const parentOf =
      typeof options.parentOf === 'function'
        ? options.parentOf
        : (value) => {
            const parts = String(value ?? '').split('/').filter(Boolean);
            if (parts.length <= 1) return '.';
            return parts.slice(0, -1).join('/');
          };
    const parent = parentOf(path);
    if (parent === currentPath) return true;
    if (
      (currentPath === HOMES_FOLDER || currentPath === '.') &&
      homePath &&
      parent === homePath
    ) {
      return true;
    }
    return false;
  }
  return true;
}
