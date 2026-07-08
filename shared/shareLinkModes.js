/** @typedef {'view' | 'edit'} ShareLinkMode */

export const SHARE_LINK_MODE_VIEW = 'view';
export const SHARE_LINK_MODE_EDIT = 'edit';

/**
 * @param {string | undefined | null} mode
 * @returns {ShareLinkMode | null}
 */
export function normalizeShareLinkMode(mode) {
  if (mode === SHARE_LINK_MODE_EDIT) return SHARE_LINK_MODE_EDIT;
  if (mode === SHARE_LINK_MODE_VIEW) return SHARE_LINK_MODE_VIEW;
  return null;
}

/**
 * @param {{ token?: string, mode?: string } | null | undefined} record
 * @returns {ShareLinkMode | null}
 */
export function resolveShareLinkMode(record) {
  if (!record?.token) return null;
  return normalizeShareLinkMode(record.mode) ?? SHARE_LINK_MODE_VIEW;
}
