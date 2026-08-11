import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW } from '../shared/constants.js';
import { getExeRoot, getPortableRoot } from './appContext.js';
import { resolveAdminCredentials } from './envConfig.js';
import {
  findActiveMemberByCredentials,
  hasMemberLoginId,
} from './membersService.js';

const SESSIONS_FILE = '.nas4usb-sessions.json';
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @typedef {{ adminId: string, role?: string, createdAt: number, expiresAt: number | null }} AdminSession
 */

/** Sessions bound to this process run; cleared on restart. @type {Map<string, AdminSession>} */
const adminSessions = new Map();

/** "로그인 유지" sessions, keyed by sha256(token) so the file never holds usable tokens. @type {Map<string, AdminSession> | null} */
let rememberedSessions = null;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Null before the app context exists, which disables persistence instead of throwing. */
function sessionsFilePath() {
  try {
    return path.join(getPortableRoot(), SESSIONS_FILE);
  } catch {
    return null;
  }
}

function loadRememberedSessions() {
  if (rememberedSessions) return rememberedSessions;

  const file = sessionsFilePath();
  if (!file) return new Map();

  const loaded = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const now = Date.now();
    for (const [hash, value] of Object.entries(parsed?.sessions ?? {})) {
      if (!value?.adminId || typeof value.expiresAt !== 'number') continue;
      if (value.expiresAt <= now) continue;
      loaded.set(hash, {
        adminId: String(value.adminId),
        role: value.role === 'super_admin' ? 'super_admin' : 'member',
        createdAt: Number(value.createdAt) || now,
        expiresAt: value.expiresAt,
      });
    }
  } catch {
    // missing or corrupt store: start from scratch
  }

  rememberedSessions = loaded;
  return rememberedSessions;
}

function saveRememberedSessions() {
  const file = sessionsFilePath();
  if (!file || !rememberedSessions) return;
  try {
    const payload = { version: 1, sessions: Object.fromEntries(rememberedSessions) };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[auth] failed to persist sessions:', err);
  }
}

/**
 * Drops remembered sessions whose member row is gone, so deleting an account
 * also kills the sessions it left behind on disk.
 * @param {string} [portableRoot]
 */
export async function pruneRememberedSessions(portableRoot) {
  const store = loadRememberedSessions();
  if (!store.size) return;

  let changed = false;
  for (const [hash, session] of [...store]) {
    if (await hasMemberLoginId(session.adminId, portableRoot)) continue;
    store.delete(hash);
    changed = true;
  }
  if (changed) saveRememberedSessions();
}

/**
 * @param {AdminSession} session
 */
function isExpired(session) {
  return typeof session.expiresAt === 'number' && session.expiresAt <= Date.now();
}

/**
 * @param {string | null | undefined} token
 */
export function isValidAdminSession(token) {
  return Boolean(getAdminSession(token));
}

/**
 * @param {string | null | undefined} token
 * @returns {AdminSession | null}
 */
export function getAdminSession(token) {
  if (!token || typeof token !== 'string') return null;

  const live = adminSessions.get(token);
  if (live) {
    if (!isExpired(live)) return live;
    revokeAdminSession(token);
    return null;
  }

  const store = loadRememberedSessions();
  const hash = hashToken(token);
  const remembered = store.get(hash);
  if (!remembered) return null;

  if (isExpired(remembered)) {
    store.delete(hash);
    saveRememberedSessions();
    return null;
  }

  adminSessions.set(token, remembered);
  return remembered;
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
 * @param {boolean} [remember] survive an app restart ("로그인 유지")
 */
function createAdminSession(adminId, role = 'super_admin', remember = false) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  /** @type {AdminSession} */
  const session = {
    adminId,
    role,
    createdAt: now,
    expiresAt: remember ? now + REMEMBER_SESSION_TTL_MS : null,
  };
  adminSessions.set(token, session);

  if (remember) {
    loadRememberedSessions().set(hashToken(token), session);
    saveRememberedSessions();
  }

  return token;
}

/**
 * @param {string | null | undefined} token
 */
export function revokeAdminSession(token) {
  if (!token || typeof token !== 'string') return;
  adminSessions.delete(token);
  if (loadRememberedSessions().delete(hashToken(token))) {
    saveRememberedSessions();
  }
}

/**
 * @param {string} id
 * @param {string} password
 * @param {string} portableRoot
 */
export function verifyAdminLogin(id, password, portableRoot) {
  const { adminId, adminPassword } = resolveAdminCredentials(getExeRoot());
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
 * @param {{ remember?: boolean }} [options]
 */
export async function loginAdmin(id, password, portableRoot, { remember = false } = {}) {
  const providedId = String(id ?? '').trim();
  const { adminId } = resolveAdminCredentials(getExeRoot());
  const isAdminLogin = providedId.toLowerCase() === String(adminId).trim().toLowerCase();

  const member = await findActiveMemberByCredentials(id, password, portableRoot);
  if (member) {
    let role = member.role === 'super_admin' || isAdminLogin ? 'super_admin' : member.role;
    const token = createAdminSession(member.loginId, role, remember);
    try {
      const { ensureMemberHome } = await import('./memberHomeService.js');
      await ensureMemberHome(member.loginId);
    } catch (err) {
      console.warn('[auth] ensure member home failed:', err);
    }
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
    const token = createAdminSession(adminId, 'super_admin', remember);
    try {
      const { ensureMemberHome } = await import('./memberHomeService.js');
      await ensureMemberHome(adminId);
    } catch (err) {
      console.warn('[auth] ensure member home failed:', err);
    }
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

  const { adminId } = resolveAdminCredentials(getExeRoot());
  if (await hasMemberLoginId(adminId, portableRoot)) return false;

  return verifyAdminLogin(DEFAULT_ADMIN_ID, DEFAULT_ADMIN_PW, portableRoot);
}
