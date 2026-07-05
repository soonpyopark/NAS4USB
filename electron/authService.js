import crypto from 'node:crypto';
import { resolveAdminCredentials } from './envConfig.js';

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
  return { success: true, adminId };
}
