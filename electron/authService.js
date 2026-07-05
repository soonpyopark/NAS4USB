import crypto from 'node:crypto';
import { resolveAdminCredentials } from './envConfig.js';

/** @type {Map<string, { adminId: string, createdAt: number }>} */
const adminSessions = new Map();

/**
 * @param {string | null | undefined} token
 */
export function isValidAdminSession(token) {
  if (!token || typeof token !== 'string') return false;
  return adminSessions.has(token);
}

/**
 * @param {string} adminId
 */
function createAdminSession(adminId) {
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, { adminId, createdAt: Date.now() });
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
export function loginAdmin(id, password, portableRoot) {
  const valid = verifyAdminLogin(id, password, portableRoot);
  if (!valid) {
    return { success: false };
  }

  const { adminId } = resolveAdminCredentials(portableRoot);
  const token = createAdminSession(adminId);
  return { success: true, adminId, token };
}
