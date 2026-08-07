/**
 * @typedef {{ view: boolean, read: boolean, write: boolean }} AccessPermissionFlags
 */

/** @type {AccessPermissionFlags} */
export const DEFAULT_GUEST_PERMISSIONS = {
  view: false,
  read: false,
  write: false,
};

/** @type {AccessPermissionFlags} */
export const DEFAULT_LOGGED_IN_PERMISSIONS = {
  view: true,
  read: true,
  write: true,
};

/**
 * @param {unknown} value
 * @returns {AccessPermissionFlags}
 */
export function normalizeAccessPermissions(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_GUEST_PERMISSIONS };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return {
    view: record.view !== false,
    read: record.read !== false,
    write: record.write !== false,
  };
}

/** @deprecated use normalizeAccessPermissions */
export const normalizeGuestPermissions = normalizeAccessPermissions;

/**
 * Checkbox-style normalize used when saving from UI (missing keys → false).
 * @param {unknown} value
 * @returns {AccessPermissionFlags}
 */
export function normalizeAccessPermissionsFromUi(value) {
  if (!value || typeof value !== 'object') {
    return { view: false, read: false, write: false };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return {
    view: Boolean(record.view),
    read: Boolean(record.read),
    write: Boolean(record.write),
  };
}

/** @deprecated use normalizeAccessPermissionsFromUi */
export const normalizeGuestPermissionsFromUi = normalizeAccessPermissionsFromUi;
