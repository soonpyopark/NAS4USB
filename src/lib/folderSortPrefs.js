const STORAGE_KEY = 'nas4usb.folderSort';

/** @typedef {'name'|'modifiedAt'|'size'|'type'} SortField */
/** @typedef {'asc'|'desc'} SortDirection */

export const DEFAULT_FOLDER_SORT = /** @type {{ field: SortField, direction: SortDirection }} */ ({
  field: 'name',
  direction: 'asc',
});

const SORT_FIELDS = new Set(['name', 'modifiedAt', 'size', 'type']);
const SORT_DIRECTIONS = new Set(['asc', 'desc']);

/**
 * @param {string} relativePath
 */
export function folderSortKey(relativePath) {
  const normalized = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return normalized === '' || normalized === '.' ? '.' : normalized;
}

/**
 * @param {unknown} value
 * @returns {{ field: SortField, direction: SortDirection } | null}
 */
function parseSortPref(value) {
  if (!value || typeof value !== 'object') return null;
  const field = /** @type {{ field?: unknown }} */ (value).field;
  const direction = /** @type {{ direction?: unknown }} */ (value).direction;
  if (typeof field !== 'string' || !SORT_FIELDS.has(field)) return null;
  if (typeof direction !== 'string' || !SORT_DIRECTIONS.has(direction)) return null;
  return { field: /** @type {SortField} */ (field), direction: /** @type {SortDirection} */ (direction) };
}

/**
 * @returns {Record<string, { field: SortField, direction: SortDirection }>}
 */
function readMap() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    /** @type {Record<string, { field: SortField, direction: SortDirection }>} */
    const map = {};
    for (const [key, value] of Object.entries(parsed)) {
      const pref = parseSortPref(value);
      if (pref) map[key] = pref;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * @param {string} relativePath
 */
export function readFolderSort(relativePath) {
  const map = readMap();
  return map[folderSortKey(relativePath)] ?? DEFAULT_FOLDER_SORT;
}

/**
 * @param {string} relativePath
 * @param {SortField} field
 * @param {SortDirection} direction
 */
export function writeFolderSort(relativePath, field, direction) {
  const pref = parseSortPref({ field, direction });
  if (!pref) return;
  try {
    const map = readMap();
    map[folderSortKey(relativePath)] = pref;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}
