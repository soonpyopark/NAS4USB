import crypto from 'node:crypto';
import { DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW } from '../shared/constants.js';
import { resolveAdminCredentials } from './envConfig.js';
import {
  findActiveMemberByCredentials,
  hasMemberLoginId,
} from './membersService.js';

/** @type {Map<string, { adminId: string, role?: string, createdAt: number }>} */
const adminSessions = new Map();

/**
 * @param {string | null | undefined} token
 */
export function isValidAdminSession(token) {
  if (!token || typeof token !== 'string') return false;
  return adminSessions.has(token);
}

/**
 * @param {string | null | undefined} token
 */
export function getAdminSession(token) {
  if (!token || typeof token !== 'string') return null;
  return adminSessions.get(token) ?? null;
}

/**
 * @param {string | null | undefined} token
 */
export function isSuperAdminSession(token) {
  const session = getAdminSession(token);
  return Boolean(session && session.role === 'super_admin');
}

/**
 * @param {string} adminId
 * @param {string} [role]
 */
function createAdminSession(adminId, role = 'super_admin') {
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, { adminId, role, createdAt: Date.now() });
  return token;
}

/**
 * @param {string | null | undefined} token
 */
export function revokeAdminSession(token) {
  if (!token || typeof token !== 'string') return;
  adminSessions.delete(token);
}

/**
 * @param {string} id
 * @param {string} password
 * @param {string} portableRoot
 */
export function verifyAdminLogin(id, password, portableRoot) {
  const { adminId, adminPassword } = resolveAdminCredentials(portableRoot);
  const providedId = String(id ?? '').trim();
  const providedPassword = String(password ?? '');

  const idMatch =
    providedId.length === adminId.length &&
    crypto.timingSafeEqual(Buffer.from(providedId, 'utf8'), Buffer.from(adminId, 'utf8'));

  const passwordMatch =
    providedPassword.length === adminPassword.length &&
    crypto.timingSafeEqual(Buffer.from(providedPassword, 'utf8'), Buffer.from(adminPassword, 'utf8'));

  return idMatch && passwordMatch;
}

/**
 * Prefers members.json (including seeded bootstrap admin). When that admin row exists,
 * its password hash overrides the plaintext .env password.
 * @param {string} id
 * @param {string} password
 * @param {string} portableRoot
 */
export async function loginAdmin(id, password, portableRoot) {
  const providedId = String(id ?? '').trim();
  const { adminId } = resolveAdminCredentials(portableRoot);
  const isAdminLogin = providedId.toLowerCase() === String(adminId).trim().toLowerCase();

  const member = await findActiveMemberByCredentials(id, password, portableRoot);
  if (member) {
    let role = member.role === 'super_admin' || isAdminLogin ? 'super_admin' : member.role;
    const token = createAdminSession(member.loginId, role);
    return {
      success: true,
      adminId: member.loginId,
      role,
      token,
    };
  }

  // .env plaintext only when no members.json admin row exists yet (seed failed / legacy).
  if (
    isAdminLogin &&
    !(await hasMemberLoginId(adminId, portableRoot)) &&
    verifyAdminLogin(id, password, portableRoot)
  ) {
    const token = createAdminSession(adminId, 'super_admin');
    return { success: true, adminId, role: 'super_admin', token };
  }

  return { success: false };
}

/**
 * True while default admin / admin1234 credentials still authenticate
 * (first-run hint on the login dialog).
 * @param {string} portableRoot
 */
export async function isDefaultAdminPasswordActive(portableRoot) {
  const member = await findActiveMemberByCredentials(
    DEFAULT_ADMIN_ID,
    DEFAULT_ADMIN_PW,
    portableRoot,
  );
  if (member) return true;

  const { adminId } = resolveAdminCredentials(portableRoot);
  if (await hasMemberLoginId(adminId, portableRoot)) return false;

  return verifyAdminLogin(DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW, portableRoot);
}
