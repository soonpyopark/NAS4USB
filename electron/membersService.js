import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getExeRoot, getPortableRoot } from './appContext.js';
import { resolveAdminCredentials } from './envConfig.js';
import {
  BOOTSTRAP_ADMIN_MEMBER_ID,
  DEFAULT_MEMBER_PERMISSIONS,
  isBootstrapAdminMemberId,
  normalizeMemberPermissions,
  normalizeMemberPermissionsFromUi,
  normalizeMemberRole,
} from '../shared/members.js';

const MEMBERS_FILE = '.nas4usb-members.json';
const PASSWORD_SALT =
  process.env.NAS4USB_MEMBER_PASSWORD_SALT?.trim() || 'nas4usb-member-v1';

/**
 * @typedef {import('../shared/members.js').MemberRecord} MemberRecord
 * @typedef {import('../shared/members.js').PublicMember} PublicMember
 * @typedef {import('../shared/members.js').MemberRole} MemberRole
 */

/**
 * @param {string} password
 */
export function hashMemberPassword(password) {
  return crypto.createHash('sha256').update(`${PASSWORD_SALT}:${password}`).digest('hex');
}

/**
 * @param {string} password
 * @param {string} expectedHash
 */
export function verifyMemberPassword(password, expectedHash) {
  const actual = hashMemberPassword(password);
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * @param {string} [portableRoot]
 */
function membersFilePath(portableRoot = getPortableRoot()) {
  return path.join(portableRoot, MEMBERS_FILE);
}

/**
 * @param {unknown} raw
 * @returns {MemberRecord | null}
 */
function normalizeStoredMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const id = String(record.id ?? '').trim();
  const loginId = String(record.loginId ?? '').trim();
  const passwordHash = String(record.passwordHash ?? '').trim();
  if (!id || !loginId || !passwordHash) return null;
  const hasPermissionsField = 'permissions' in record;
  return {
    id,
    loginId,
    displayName: String(record.displayName ?? loginId).trim() || loginId,
    passwordHash,
    role: normalizeMemberRole(record.role),
    active: record.active !== false,
    permissions: hasPermissionsField
      ? normalizeMemberPermissionsFromUi(record.permissions)
      : normalizeMemberPermissions(DEFAULT_MEMBER_PERMISSIONS),
  };
}

/**
 * @param {string} [portableRoot]
 * @returns {Promise<MemberRecord[]>}
 */
async function loadMembers(portableRoot = getPortableRoot()) {
  try {
    const raw = await fs.readFile(membersFilePath(portableRoot), 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed?.members;
    if (!Array.isArray(items)) return [];
    return items.map(normalizeStoredMember).filter(Boolean);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * @param {MemberRecord[]} members
 * @param {string} [portableRoot]
 */
async function writeMembers(members, portableRoot = getPortableRoot()) {
  const filePath = membersFilePath(portableRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ members }, null, 2)}\n`, 'utf8');
}

/**
 * @param {MemberRecord} member
 * @returns {PublicMember}
 */
function toPublicMember(member) {
  return {
    id: member.id,
    loginId: member.loginId,
    displayName: member.displayName,
    role: member.role,
    active: member.active,
    permissions: normalizeMemberPermissions(member.permissions),
    isBootstrapAdmin: isBootstrapAdminMemberId(member.id),
  };
}

/**
 * @param {string} loginId
 * @param {string} [portableRoot]
 * @returns {Promise<import('../shared/members.js').MemberAccessPermissions | null>}
 */
export async function getMemberAccessPermissionsByLoginId(
  loginId,
  portableRoot = getPortableRoot(),
) {
  const key = String(loginId ?? '').trim().toLowerCase();
  if (!key) return null;
  const members = await loadMembers(portableRoot);
  const member = members.find((entry) => entry.loginId.toLowerCase() === key);
  if (!member) return null;
  return normalizeMemberPermissions(member.permissions);
}

/**
 * Seed the .env admin into the member list so 회원관리 can change its password.
 * Never resets an existing password hash (UI override wins over .env).
 * @param {string} [portableRoot]
 */
export async function ensureBootstrapAdmin(portableRoot = getPortableRoot()) {
  const { adminId, adminPassword } = resolveAdminCredentials(getExeRoot());
  const loginId = String(adminId).trim() || 'admin';
  const members = await loadMembers(portableRoot);
  const bootstrap = members.find((member) => isBootstrapAdminMemberId(member.id));

  if (!bootstrap) {
    const byLogin = members.find(
      (member) => member.loginId.toLowerCase() === loginId.toLowerCase(),
    );
    if (byLogin) {
      const next = members.map((member) =>
        member.id === byLogin.id
          ? {
              ...member,
              id: BOOTSTRAP_ADMIN_MEMBER_ID,
              loginId,
              displayName: member.displayName || loginId,
              role: /** @type {MemberRole} */ ('super_admin'),
              active: true,
              permissions: normalizeMemberPermissions(member.permissions),
            }
          : member,
      );
      await writeMembers(next, portableRoot);
      return;
    }

    members.unshift({
      id: BOOTSTRAP_ADMIN_MEMBER_ID,
      loginId,
      displayName: loginId,
      passwordHash: hashMemberPassword(adminPassword),
      role: 'super_admin',
      active: true,
      permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
    });
    await writeMembers(members, portableRoot);
    return;
  }

  let dirty = false;
  const nextBootstrap = { ...bootstrap };
  if (bootstrap.loginId !== loginId) {
    nextBootstrap.loginId = loginId;
    dirty = true;
  }
  if (bootstrap.role !== 'super_admin') {
    nextBootstrap.role = 'super_admin';
    dirty = true;
  }
  if (!bootstrap.active) {
    nextBootstrap.active = true;
    dirty = true;
  }
  if (!bootstrap.permissions) {
    nextBootstrap.permissions = { ...DEFAULT_MEMBER_PERMISSIONS };
    dirty = true;
  }
  if (dirty) {
    await writeMembers(
      members.map((member) => (isBootstrapAdminMemberId(member.id) ? nextBootstrap : member)),
      portableRoot,
    );
  }
}

/**
 * Persist default permissions onto members that predate the permissions field.
 * @param {string} [portableRoot]
 */
async function ensureMemberPermissionsPersisted(portableRoot = getPortableRoot()) {
  let rawItems = [];
  try {
    const raw = await fs.readFile(membersFilePath(portableRoot), 'utf8');
    const parsed = JSON.parse(raw);
    rawItems = Array.isArray(parsed) ? parsed : parsed?.members;
    if (!Array.isArray(rawItems)) return;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const missing = rawItems.some(
    (item) => !item || typeof item !== 'object' || !('permissions' in item),
  );
  if (!missing) return;

  const members = await loadMembers(portableRoot);
  await writeMembers(
    members.map((member) => ({
      ...member,
      permissions: normalizeMemberPermissions(member.permissions),
    })),
    portableRoot,
  );
}

/**
 * @param {string} [portableRoot]
 * @returns {Promise<{ members: PublicMember[] }>}
 */
export async function listMembers(portableRoot = getPortableRoot()) {
  await ensureBootstrapAdmin(portableRoot);
  await ensureMemberPermissionsPersisted(portableRoot);
  const members = await loadMembers(portableRoot);
  const sorted = [...members].sort((a, b) => {
    const aBoot = isBootstrapAdminMemberId(a.id) ? 0 : 1;
    const bBoot = isBootstrapAdminMemberId(b.id) ? 0 : 1;
    if (aBoot !== bBoot) return aBoot - bBoot;
    return a.loginId.localeCompare(b.loginId, 'en', { sensitivity: 'base' });
  });
  return { members: sorted.map(toPublicMember) };
}

/**
 * @param {string} loginId
 * @param {string} [portableRoot]
 */
export async function hasMemberLoginId(loginId, portableRoot = getPortableRoot()) {
  const key = String(loginId ?? '').trim();
  if (!key) return false;
  const members = await loadMembers(portableRoot);
  return members.some((member) => member.loginId.toLowerCase() === key.toLowerCase());
}

/**
 * @param {string} loginId
 * @param {string} password
 * @param {string} [portableRoot]
 * @returns {Promise<MemberRecord | null>}
 */
export async function findActiveMemberByCredentials(
  loginId,
  password,
  portableRoot = getPortableRoot(),
) {
  const providedId = String(loginId ?? '').trim();
  const providedPassword = String(password ?? '');
  if (!providedId || !providedPassword) return null;

  const members = await loadMembers(portableRoot);
  const member = members.find(
    (entry) => entry.active && entry.loginId.toLowerCase() === providedId.toLowerCase(),
  );
  if (!member) return null;
  if (!verifyMemberPassword(providedPassword, member.passwordHash)) return null;
  return member;
}

/**
 * @typedef {{
 *   id?: string,
 *   loginId: string,
 *   displayName?: string,
 *   role?: MemberRole | string,
 *   active?: boolean,
 *   password?: string,
 *   passwordHash?: string,
 *   permissions?: import('../shared/members.js').MemberAccessPermissions,
 *   _delete?: boolean,
 * }} MemberSaveItem
 */

/**
 * Export members including password hashes (for backup/restore).
 * @param {string} [portableRoot]
 */
export async function getMembersExportRecords(portableRoot = getPortableRoot()) {
  await ensureBootstrapAdmin(portableRoot);
  await ensureMemberPermissionsPersisted(portableRoot);
  const members = await loadMembers(portableRoot);
  const sorted = [...members].sort((a, b) => {
    const aBoot = isBootstrapAdminMemberId(a.id) ? 0 : 1;
    const bBoot = isBootstrapAdminMemberId(b.id) ? 0 : 1;
    if (aBoot !== bBoot) return aBoot - bBoot;
    return a.loginId.localeCompare(b.loginId, 'en', { sensitivity: 'base' });
  });
  return sorted.map((member) => ({
    id: member.id,
    loginId: member.loginId,
    displayName: member.displayName,
    role: member.role,
    active: member.active,
    permissions: normalizeMemberPermissions(member.permissions),
    passwordHash: member.passwordHash,
    isBootstrapAdmin: isBootstrapAdminMemberId(member.id),
  }));
}

/**
 * @param {{ members?: MemberSaveItem[] }} payload
 * @param {string} [portableRoot]
 * @returns {Promise<{ ok: true, members: PublicMember[] } | { ok: false, message: string }>}
 */
export async function saveMembersPayload(payload, portableRoot = getPortableRoot()) {
  const memberPayload = Array.isArray(payload?.members) ? payload.members : null;
  if (!memberPayload) {
    return { ok: false, message: '회원 목록이 올바르지 않습니다.' };
  }

  await ensureBootstrapAdmin(portableRoot);
  const { adminId } = resolveAdminCredentials(getExeRoot());
  const bootstrapLoginKey = String(adminId).trim().toLowerCase();

  const existingMembers = await loadMembers(portableRoot);
  const deleteIds = new Set(
    memberPayload.filter((item) => item?._delete && item.id).map((item) => String(item.id)),
  );

  if (deleteIds.has(BOOTSTRAP_ADMIN_MEMBER_ID)) {
    return { ok: false, message: '기본 관리자(admin) 계정은 삭제할 수 없습니다.' };
  }

  /** @type {string[]} */
  const deletedHomeLoginIds = existingMembers
    .filter((member) => deleteIds.has(member.id) && !isBootstrapAdminMemberId(member.id))
    .map((member) => String(member.loginId ?? '').trim())
    .filter(Boolean);

  /** @type {MemberRecord[]} */
  let nextMembers = existingMembers.filter((member) => !deleteIds.has(member.id));
  const loginIds = new Set(nextMembers.map((member) => member.loginId.toLowerCase()));
  /** @type {Array<{ from: string, to: string }>} */
  const homeRenames = [];

  for (const patch of memberPayload) {
    if (!patch?.id || patch._delete) continue;
    const existing = nextMembers.find((member) => member.id === patch.id);
    if (!existing) {
      return { ok: false, message: '수정할 회원을 찾을 수 없습니다.' };
    }

    const isBootstrap = isBootstrapAdminMemberId(existing.id);
    let loginId = String(patch.loginId ?? '').trim();
    if (isBootstrap) {
      loginId = existing.loginId;
    }
    if (!isBootstrap && existing.loginId !== loginId) {
      homeRenames.push({ from: existing.loginId, to: loginId });
    }
    const displayName = isBootstrap
      ? existing.displayName || loginId
      : String(patch.displayName ?? loginId).trim() || loginId;
    if (!loginId) {
      return { ok: false, message: '로그인 아이디를 입력해 주세요.' };
    }

    const loginKey = loginId.toLowerCase();
    const duplicate = nextMembers.find(
      (member) => member.id !== existing.id && member.loginId.toLowerCase() === loginKey,
    );
    if (duplicate) {
      return { ok: false, message: `아이디 「${loginId}」가 이미 사용 중입니다.` };
    }

    loginIds.delete(existing.loginId.toLowerCase());

    let passwordHash = existing.passwordHash;
    const password = String(patch.password ?? '').trim();
    const importedHash = String(patch.passwordHash ?? '').trim();
    if (password) {
      if (password.length < 6) {
        return { ok: false, message: '비밀번호는 6자 이상이어야 합니다.' };
      }
      passwordHash = hashMemberPassword(password);
    } else if (importedHash && /^[a-f0-9]{64}$/i.test(importedHash)) {
      passwordHash = importedHash.toLowerCase();
    }

    const permissions =
      patch.permissions !== undefined
        ? normalizeMemberPermissionsFromUi(patch.permissions)
        : normalizeMemberPermissions(existing.permissions);

    nextMembers = nextMembers.map((member) =>
      member.id === existing.id
        ? {
            ...member,
            loginId,
            displayName,
            role: isBootstrap ? 'super_admin' : normalizeMemberRole(patch.role ?? member.role),
            active: isBootstrap ? true : patch.active !== false,
            passwordHash,
            permissions,
          }
        : member,
    );
    loginIds.add(loginKey);
  }

  for (const patch of memberPayload) {
    if (patch?.id || patch?._delete) continue;

    const loginId = String(patch.loginId ?? '').trim();
    const displayName = String(patch.displayName ?? loginId).trim() || loginId;
    const password = String(patch.password ?? '').trim();
    const importedHash = String(patch.passwordHash ?? '').trim();
    if (!loginId) {
      return { ok: false, message: '새 회원의 로그인 아이디를 입력해 주세요.' };
    }
    if (password && password.length < 6) {
      return { ok: false, message: '새 회원 비밀번호는 6자 이상이어야 합니다.' };
    }
    if (!password && !(importedHash && /^[a-f0-9]{64}$/i.test(importedHash))) {
      return {
        ok: false,
        message: '새 회원은 비밀번호(6자 이상) 또는 내보내기 해시가 필요합니다.',
      };
    }
    if (loginIds.has(loginId.toLowerCase())) {
      return { ok: false, message: `아이디 「${loginId}」가 이미 사용 중입니다.` };
    }
    if (loginId.toLowerCase() === bootstrapLoginKey) {
      return {
        ok: false,
        message: `아이디 「${loginId}」는 기본 관리자 계정과 겹칠 수 없습니다.`,
      };
    }

    nextMembers.push({
      id: `member-${crypto.randomUUID().slice(0, 8)}`,
      loginId,
      displayName,
      passwordHash: password
        ? hashMemberPassword(password)
        : importedHash.toLowerCase(),
      role: normalizeMemberRole(patch.role),
      active: patch.active !== false,
      permissions:
        patch.permissions !== undefined
          ? normalizeMemberPermissionsFromUi(patch.permissions)
          : { ...DEFAULT_MEMBER_PERMISSIONS },
    });
    loginIds.add(loginId.toLowerCase());
  }

  await writeMembers(nextMembers, portableRoot);

  try {
    const {
      deleteMemberHome,
      ensureMemberHome,
      pruneOrphanMemberHomes,
      renameMemberHomeIfNeeded,
    } = await import('./memberHomeService.js');
    for (const loginId of deletedHomeLoginIds) {
      await deleteMemberHome(loginId).catch((err) => {
        console.warn(`[members] delete home failed for ${loginId}:`, err);
      });
    }
    for (const rename of homeRenames) {
      await renameMemberHomeIfNeeded(rename.from, rename.to).catch(() => {});
    }
    for (const member of nextMembers) {
      if (!member.active) continue;
      await ensureMemberHome(member.loginId).catch(() => {});
    }
    await pruneOrphanMemberHomes(portableRoot, {
      loginIds: nextMembers.map((member) => member.loginId),
    }).catch((err) => {
      console.warn('[members] prune orphan homes failed:', err);
    });
  } catch (err) {
    console.warn('[members] ensure member homes failed:', err);
  }

  const listed = await listMembers(portableRoot);
  return { ok: true, members: listed.members };
}
