import {
  DEFAULT_GUEST_PERMISSIONS,
  normalizeAccessPermissionsFromUi,
} from './guestPermissions.js';
import {
  BOOTSTRAP_ADMIN_MEMBER_ID,
  DEFAULT_MEMBER_PERMISSIONS,
  isBootstrapAdminMemberId,
  normalizeMemberPermissionsFromUi,
  normalizeMemberRole,
} from './members.js';

export const MEMBERS_EXPORT_KIND = 'nas4usb-members';
export const MEMBERS_EXPORT_VERSION = 1;

/**
 * @typedef {{
 *   loginId: string,
 *   displayName?: string,
 *   role?: string,
 *   active?: boolean,
 *   permissions?: { view?: boolean, read?: boolean, write?: boolean },
 *   passwordHash?: string,
 *   password?: string,
 *   isBootstrapAdmin?: boolean,
 *   id?: string,
 * }} MembersExportItem
 */

/**
 * @param {{
 *   members: MembersExportItem[],
 *   guestPermissions?: { view?: boolean, read?: boolean, write?: boolean },
 * }} data
 * @param {string} [exportedAt]
 */
export function buildMembersExportPayload(data, exportedAt = new Date().toISOString()) {
  const members = (Array.isArray(data.members) ? data.members : []).map((member) => {
    const loginId = String(member.loginId ?? '').trim();
    const isBootstrap =
      member.isBootstrapAdmin === true || isBootstrapAdminMemberId(member.id);
    return {
      loginId,
      displayName: String(member.displayName ?? loginId).trim() || loginId,
      role: isBootstrap ? 'super_admin' : normalizeMemberRole(member.role),
      active: isBootstrap ? true : member.active !== false,
      permissions: normalizeMemberPermissionsFromUi(
        member.permissions ?? DEFAULT_MEMBER_PERMISSIONS,
      ),
      ...(isBootstrap ? { isBootstrapAdmin: true } : {}),
      ...(member.passwordHash ? { passwordHash: String(member.passwordHash) } : {}),
    };
  });

  return {
    kind: MEMBERS_EXPORT_KIND,
    version: MEMBERS_EXPORT_VERSION,
    exportedAt,
    guestPermissions: normalizeAccessPermissionsFromUi(
      data.guestPermissions ?? DEFAULT_GUEST_PERMISSIONS,
    ),
    members,
  };
}

/**
 * @param {string} text
 * @returns {{
 *   guestPermissions: { view: boolean, read: boolean, write: boolean },
 *   members: MembersExportItem[],
 * }}
 */
export function parseMembersExportPayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('회원 관리 파일 형식을 인식할 수 없습니다.');
  }

  if (parsed.kind != null && parsed.kind !== MEMBERS_EXPORT_KIND) {
    throw new Error('회원 관리 파일이 아닙니다.');
  }

  if (!Array.isArray(parsed.members)) {
    throw new Error('members 항목이 없습니다.');
  }

  /** @type {MembersExportItem[]} */
  const members = [];
  for (const raw of parsed.members) {
    if (!raw || typeof raw !== 'object') continue;
    const loginId = String(raw.loginId ?? '').trim();
    if (!loginId || loginId.toLowerCase() === 'guest') continue;
    const isBootstrap =
      raw.isBootstrapAdmin === true || isBootstrapAdminMemberId(raw.id);
    members.push({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      loginId,
      displayName: String(raw.displayName ?? loginId).trim() || loginId,
      role: isBootstrap ? 'super_admin' : normalizeMemberRole(raw.role),
      active: isBootstrap ? true : raw.active !== false,
      permissions: normalizeMemberPermissionsFromUi(
        raw.permissions ?? DEFAULT_MEMBER_PERMISSIONS,
      ),
      isBootstrapAdmin: isBootstrap,
      ...(typeof raw.passwordHash === 'string' && raw.passwordHash
        ? { passwordHash: raw.passwordHash }
        : {}),
      ...(typeof raw.password === 'string' && raw.password.trim()
        ? { password: raw.password.trim() }
        : {}),
    });
  }

  if (members.length === 0) {
    throw new Error('가져올 회원 항목이 없습니다.');
  }

  return {
    guestPermissions: normalizeAccessPermissionsFromUi(
      parsed.guestPermissions ?? DEFAULT_GUEST_PERMISSIONS,
    ),
    members,
  };
}

/**
 * @param {Date} [date]
 */
export function membersExportFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
  return `nas4usb-members-${stamp}.json`;
}

export { BOOTSTRAP_ADMIN_MEMBER_ID };
