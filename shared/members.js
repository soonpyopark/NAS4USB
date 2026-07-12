/**
 * @typedef {'member' | 'super_admin'} MemberRole
 *
 * @typedef {{
 *   id: string,
 *   loginId: string,
 *   displayName: string,
 *   passwordHash: string,
 *   role: MemberRole,
 *   active: boolean,
 * }} MemberRecord
 *
 * @typedef {{
 *   id: string,
 *   loginId: string,
 *   displayName: string,
 *   role: MemberRole,
 *   active: boolean,
 * }} PublicMember
 */

export const MEMBER_ROLES = /** @type {const} */ (['member', 'super_admin']);

/** @param {MemberRole | string | undefined} role */
export function memberRoleToLabel(role) {
  return role === 'super_admin' ? '총괄관리자' : '일반사용자';
}

/** @param {string} loginId */
export function defaultMemberPassword(loginId) {
  return `${String(loginId ?? '').trim()}!!`;
}

/**
 * @param {unknown} value
 * @returns {MemberRole}
 */
export function normalizeMemberRole(value) {
  return value === 'super_admin' ? 'super_admin' : 'member';
}
