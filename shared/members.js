/**
 * @typedef {'member' | 'super_admin'} MemberRole
 * @typedef {{ view: boolean, read: boolean, write: boolean }} MemberAccessPermissions
 *
 * @typedef {{
 *   id: string,
 *   loginId: string,
 *   displayName: string,
 *   passwordHash: string,
 *   role: MemberRole,
 *   active: boolean,
 *   permissions: MemberAccessPermissions,
 * }} MemberRecord
 *
 * @typedef {{
 *   id: string,
 *   loginId: string,
 *   displayName: string,
 *   role: MemberRole,
 *   active: boolean,
 *   permissions: MemberAccessPermissions,
 *   isBootstrapAdmin?: boolean,
 * }} PublicMember
 */

export const MEMBER_ROLES = /** @type {const} */ (['member', 'super_admin']);

/** Fixed id of the seeded .env bootstrap admin row. */
export const BOOTSTRAP_ADMIN_MEMBER_ID = 'member-bootstrap-admin';

/** Synthetic guest row id used only in 회원 관리 UI (not stored in members.json). */
export const GUEST_MEMBER_ID = 'member-guest';

/** @type {MemberAccessPermissions} */
export const DEFAULT_MEMBER_PERMISSIONS = {
  view: true,
  read: true,
  write: true,
};

/**
 * @param {unknown} value
 * @returns {MemberAccessPermissions}
 */
export function normalizeMemberPermissions(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_MEMBER_PERMISSIONS };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const view = record.view !== false;
  return {
    view,
    read: view && record.read !== false,
    write: view && record.write !== false,
  };
}

/**
 * Checkbox-style normalize used when saving from UI (missing keys → false).
 * @param {unknown} value
 * @returns {MemberAccessPermissions}
 */
export function normalizeMemberPermissionsFromUi(value) {
  if (!value || typeof value !== 'object') {
    return { view: false, read: false, write: false };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const view = Boolean(record.view);
  return {
    view,
    read: view && Boolean(record.read),
    write: view && Boolean(record.write),
  };
}

/**
 * @param {Pick<PublicMember, 'id' | 'isBootstrapAdmin'> | null | undefined} member
 */
export function isBootstrapAdminMember(member) {
  if (!member) return false;
  if (member.isBootstrapAdmin === true) return true;
  return member.id === BOOTSTRAP_ADMIN_MEMBER_ID;
}

/** @param {string | null | undefined} id */
export function isBootstrapAdminMemberId(id) {
  return String(id ?? '') === BOOTSTRAP_ADMIN_MEMBER_ID;
}

/** @param {string | null | undefined} id */
export function isGuestMemberId(id) {
  return String(id ?? '') === GUEST_MEMBER_ID;
}

/** @param {MemberRole | string | undefined} role */
export function memberRoleToLabel(role) {
  return role === 'super_admin' ? '총괄관리자' : '일반사용자';
}

/** @param {string} loginId */
export function defaultMemberPassword(loginId) {
  return `${String(loginId ?? '').trim()}!!`;
}

/**
 * @param {MemberRole | string | undefined} role
 */
export function normalizeMemberRole(value) {
  return value === 'super_admin' ? 'super_admin' : 'member';
}
