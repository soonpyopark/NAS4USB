import crypto from 'node:crypto';
import { resolveAdminCredentials } from './envConfig.js';
import { findActiveMemberByCredentials } from './membersService.js';

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
 * @param {string} id
 * @param {string} password
 * @param {string} portableRoot
 */
export async function loginAdmin(id, password, portableRoot) {
  if (verifyAdminLogin(id, password, portableRoot)) {
    const { adminId } = resolveAdminCredentials(portableRoot);
    const token = createAdminSession(adminId, 'super_admin');
    return { success: true, adminId, role: 'super_admin', token };
  }

  const member = await findActiveMemberByCredentials(id, password, portableRoot);
  if (!member) {
    return { success: false };
  }

  const token = createAdminSession(member.loginId, member.role);
  return {
    success: true,
    adminId: member.loginId,
    role: member.role,
    token,
  };
}
