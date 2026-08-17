import { useCallback, useEffect, useState } from 'react';
import {
  LEGACY_ADMIN_ID_STORAGE_KEY,
  LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  readStorageWithLegacy,
} from '../../shared/legacyConfig.js';

const ADMIN_ID_STORAGE_KEY = 'nas4usb.adminSession';
const ADMIN_TOKEN_STORAGE_KEY = 'nas4usb.adminToken';
const ADMIN_ROLE_STORAGE_KEY = 'nas4usb.adminRole';
const ADMIN_REMEMBER_KEY = 'nas4usb.adminRemember';

/**
 * @param {{ locked?: boolean, retryAfterSec?: number } | null | undefined} result
 */
function loginFailureMessage(result) {
  if (result?.locked) {
    const sec = Number(result.retryAfterSec);
    const minutes = Math.max(1, Math.ceil((Number.isFinite(sec) && sec > 0 ? sec : 300) / 60));
    return `로그인이 일시적으로 제한되었습니다. ${minutes}분 후 다시 시도해 주세요.`;
  }
  return '아이디 또는 비밀번호가 올바르지 않습니다.';
}

/**
 * @param {string} key
 * @param {string} [legacyKey]
 */
function readAuthValue(key, legacyKey) {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore
  }
  return readStorageWithLegacy(sessionStorage, key, legacyKey);
}

function clearAuthValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * @param {boolean} rememberMe
 * @param {string} adminId
 * @param {string} token
 * @param {string} [role]
 */
function writeAuthSession(rememberMe, adminId, token, role = '') {
  const primary = rememberMe ? localStorage : sessionStorage;
  const secondary = rememberMe ? sessionStorage : localStorage;
  const normalizedRole = role === 'super_admin' ? 'super_admin' : role === 'member' ? 'member' : '';
  try {
    primary.setItem(ADMIN_ID_STORAGE_KEY, adminId);
    primary.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    if (normalizedRole) {
      primary.setItem(ADMIN_ROLE_STORAGE_KEY, normalizedRole);
    } else {
      primary.removeItem(ADMIN_ROLE_STORAGE_KEY);
    }
    localStorage.setItem(ADMIN_REMEMBER_KEY, rememberMe ? '1' : '0');
  } catch {
    // ignore
  }
  try {
    secondary.removeItem(ADMIN_ID_STORAGE_KEY);
    secondary.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    secondary.removeItem(ADMIN_ROLE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readStoredAdminId() {
  return (
    readAuthValue(ADMIN_ID_STORAGE_KEY, LEGACY_ADMIN_ID_STORAGE_KEY) ||
    readStorageWithLegacy(sessionStorage, ADMIN_ID_STORAGE_KEY, LEGACY_ADMIN_ID_STORAGE_KEY)
  );
}

function readStoredAdminToken() {
  return (
    readAuthValue(ADMIN_TOKEN_STORAGE_KEY, LEGACY_ADMIN_TOKEN_STORAGE_KEY) ||
    readStorageWithLegacy(sessionStorage, ADMIN_TOKEN_STORAGE_KEY, LEGACY_ADMIN_TOKEN_STORAGE_KEY)
  );
}

function readStoredAdminRole() {
  return readAuthValue(ADMIN_ROLE_STORAGE_KEY) || '';
}

function clearStoredAuth() {
  clearAuthValue(ADMIN_ID_STORAGE_KEY);
  clearAuthValue(ADMIN_TOKEN_STORAGE_KEY);
  clearAuthValue(ADMIN_ROLE_STORAGE_KEY);
  try {
    localStorage.removeItem(ADMIN_REMEMBER_KEY);
  } catch {
    // ignore
  }
}

/**
 * Binds the token to this connection and reports the session it resolves to,
 * or null when the server no longer knows the token.
 * @param {string} token
 * @returns {Promise<{ adminId: string, role?: string } | null>}
 */
async function bindAdminToken(token) {
  if (!window.nas4usb?.auth?.bindToken) return null;
  const session = await window.nas4usb.auth.bindToken(token);
  return session && typeof session === 'object' && session.adminId ? session : null;
}

function storageHoldingToken() {
  try {
    if (localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)) return localStorage;
  } catch {
    // ignore
  }
  return sessionStorage;
}

/**
 * Reconciles stored credentials with the server before anything reads them: a token the
 * server no longer knows is wiped so the UI offers 로그인 instead of a dead 로그아웃.
 * Call this once at bootstrap so the bound token is in place before the first data fetch.
 * @returns {Promise<{ adminId: string, role: string } | null>}
 */
export async function restoreAdminSession() {
  const token = readStoredAdminToken();
  const session = token ? await bindAdminToken(token).catch(() => null) : null;

  if (!session) {
    if (token || readStoredAdminId()) clearStoredAuth();
    return null;
  }

  const role = session.role === 'super_admin' ? 'super_admin' : 'member';
  try {
    const store = storageHoldingToken();
    store.setItem(ADMIN_ID_STORAGE_KEY, session.adminId);
    store.setItem(ADMIN_ROLE_STORAGE_KEY, role);
  } catch {
    // ignore
  }
  return { adminId: session.adminId, role };
}

async function logoutAdminSession(token) {
  if (window.nas4usb?.auth?.logout) {
    await window.nas4usb.auth.logout();
    return;
  }

  if (token && window.nas4usb?.__source === 'http') {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token,
      },
      body: '{}',
    });
  }
}

/**
 * @param {{ onAuthChange?: () => void }} [options]
 */
export function useAdminAuth({ onAuthChange } = {}) {
  const [adminId, setAdminId] = useState(readStoredAdminId);
  const [adminToken, setAdminToken] = useState(readStoredAdminToken);
  const [role, setRole] = useState(readStoredAdminRole);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);

  // Stored credentials only mean "logged in" while the server still honours the token;
  // otherwise the UI would offer 로그아웃 for a session every request rejects.
  useEffect(() => {
    let cancelled = false;
    setLoggingIn(false);

    void (async () => {
      const hadStoredSession = Boolean(readStoredAdminId());
      const session = await restoreAdminSession();
      if (cancelled) return;

      if (!session) {
        setAdminId('');
        setAdminToken('');
        setRole('');
        setSessionChecked(true);
        if (hadStoredSession) onAuthChange?.();
        return;
      }

      setAdminId(session.adminId);
      setAdminToken(readStoredAdminToken());
      setRole(session.role);
      setSessionChecked(true);
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount; onAuthChange is only used to notify consumers of a cleared session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (id, password, rememberMe = true) => {
      setLoggingIn(true);
      setError('');

      try {
        if (!window.nas4usb?.auth?.login) {
          throw new Error('로그인 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
        }

        const result = await window.nas4usb.auth.login({
          id,
          password,
          rememberMe: Boolean(rememberMe),
        });
        if (!result?.success) {
          setError(loginFailureMessage(result));
          return false;
        }

        const token = result.token ?? '';
        const nextRole = result.role === 'super_admin' ? 'super_admin' : 'member';
        writeAuthSession(Boolean(rememberMe), result.adminId, token, nextRole);
        setAdminId(result.adminId);
        setAdminToken(token);
        setRole(nextRole);
        setLoggingIn(false);
        await bindAdminToken(token);
        onAuthChange?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
        return false;
      } finally {
        setLoggingIn(false);
      }
    },
    [onAuthChange],
  );

  const logout = useCallback(async () => {
    const token = readStoredAdminToken();
    await logoutAdminSession(token);
    clearStoredAuth();
    await bindAdminToken('');
    setAdminId('');
    setAdminToken('');
    setRole('');
    setError('');
    onAuthChange?.();
  }, [onAuthChange]);

  const isLoggedIn = Boolean(adminId);
  const isSuperAdmin = isLoggedIn && role === 'super_admin';

  return {
    adminId,
    adminToken,
    role,
    sessionChecked,
    isLoggedIn,
    isAdminLoggedIn: isLoggedIn,
    isSuperAdmin,
    login,
    logout,
    loggingIn,
    error,
    clearError: () => setError(''),
  };
}
