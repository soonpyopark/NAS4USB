import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import { normalizeMemberRole } from '../shared/members.js';

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
  return {
    id,
    loginId,
    displayName: String(record.displayName ?? loginId).trim() || loginId,
    passwordHash,
    role: normalizeMemberRole(record.role),
    active: record.active !== false,
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
  };
}

/**
 * @param {string} [portableRoot]
 * @returns {Promise<{ members: PublicMember[] }>}
 */
export async function listMembers(portableRoot = getPortableRoot()) {
  const members = await loadMembers(portableRoot);
  return { members: members.map(toPublicMember) };
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
 *   _delete?: boolean,
 * }} MemberSaveItem
 */

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

  const existingMembers = await loadMembers(portableRoot);
  const deleteIds = new Set(
    memberPayload.filter((item) => item?._delete && item.id).map((item) => String(item.id)),
  );

  /** @type {MemberRecord[]} */
  let nextMembers = existingMembers.filter((member) => !deleteIds.has(member.id));
  const loginIds = new Set(nextMembers.map((member) => member.loginId.toLowerCase()));

  for (const patch of memberPayload) {
    if (!patch?.id || patch._delete) continue;
    const existing = nextMembers.find((member) => member.id === patch.id);
    if (!existing) {
      return { ok: false, message: '수정할 회원을 찾을 수 없습니다.' };
    }

    const loginId = String(patch.loginId ?? '').trim();
    const displayName = String(patch.displayName ?? loginId).trim() || loginId;
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
    if (password) {
      if (password.length < 6) {
        return { ok: false, message: '비밀번호는 6자 이상이어야 합니다.' };
      }
      passwordHash = hashMemberPassword(password);
    }

    nextMembers = nextMembers.map((member) =>
      member.id === existing.id
        ? {
            ...member,
            loginId,
            displayName,
            role: normalizeMemberRole(patch.role ?? member.role),
            active: patch.active !== false,
            passwordHash,
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
    if (!loginId) {
      return { ok: false, message: '새 회원의 로그인 아이디를 입력해 주세요.' };
    }
    if (!password || password.length < 6) {
      return { ok: false, message: '새 회원 비밀번호는 6자 이상이어야 합니다.' };
    }
    if (loginIds.has(loginId.toLowerCase())) {
      return { ok: false, message: `아이디 「${loginId}」가 이미 사용 중입니다.` };
    }

    nextMembers.push({
      id: `member-${crypto.randomUUID().slice(0, 8)}`,
      loginId,
      displayName,
      passwordHash: hashMemberPassword(password),
      role: normalizeMemberRole(patch.role),
      active: patch.active !== false,
    });
    loginIds.add(loginId.toLowerCase());
  }

  // Env bootstrap admin always remains available, so an empty / member-only
  // list is allowed. Still block removing the last active super when others exist
  // only if that would leave zero supers while members remain — skip for NAS4USB.

  await writeMembers(nextMembers, portableRoot);
  return { ok: true, members: nextMembers.map(toPublicMember) };
}
