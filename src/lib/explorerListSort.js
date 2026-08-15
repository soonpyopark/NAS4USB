/** @typedef {'name'|'modifiedAt'|'size'|'type'|'custom'} SortField */
/** @typedef {'asc'|'desc'} SortDirection */
/** @typedef {{ field: SortField, direction: SortDirection }} ListSort */

export const DEFAULT_CUSTOM_LIST_SORT = /** @type {ListSort} */ ({
  field: 'custom',
  direction: 'asc',
});

export const DEFAULT_NAME_LIST_SORT = /** @type {ListSort} */ ({
  field: 'name',
  direction: 'asc',
});

/**
 * @param {string} column
 * @returns {SortDirection}
 */
function firstDirectionForColumn(column) {
  if (column === 'type' || column === 'name') return 'asc';
  return 'desc';
}

/**
 * Name cycles custom → name/asc → name/desc → custom.
 * Other columns toggle asc/desc, starting from a column default.
 *
 * @param {ListSort} current
 * @param {SortField} column
 * @param {boolean} allowCustom
 */
export function nextExplorerListSort(current, column, allowCustom) {
  if (column === 'name' && allowCustom) {
    if (current.field === 'custom') return { field: 'name', direction: 'asc' };
    if (current.field === 'name' && current.direction === 'asc') {
      return { field: 'name', direction: 'desc' };
    }
    if (current.field === 'name' && current.direction === 'desc') {
      return { ...DEFAULT_CUSTOM_LIST_SORT };
    }
    return { field: 'name', direction: 'asc' };
  }

  if (current.field === column) {
    return { field: column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field: column, direction: firstDirectionForColumn(column) };
}
