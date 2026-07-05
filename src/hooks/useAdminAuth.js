import { useCallback, useEffect, useState } from 'react';

const ADMIN_ID_STORAGE_KEY = 'educowork.adminSession';
const ADMIN_TOKEN_STORAGE_KEY = 'educowork.adminToken';

function readStoredAdminId() {
  try {
    return sessionStorage.getItem(ADMIN_ID_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readStoredAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

async function bindAdminToken(token) {
  if (window.educowork?.auth?.bindToken) {
    await window.educowork.auth.bindToken(token);
  }
}

async function logoutAdminSession(token) {
  if (window.educowork?.auth?.logout) {
    await window.educowork.auth.logout();
    return;
  }

  if (token && window.educowork?.__source === 'http') {
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
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void bindAdminToken(readStoredAdminToken());
  }, []);

  const login = useCallback(
    async (id, password) => {
      setLoggingIn(true);
      setError('');

      try {
        if (!window.educowork?.auth?.login) {
          throw new Error('로그인 API를 사용할 수 없습니다. 앱을 다시 실행해 주세요.');
        }

        const result = await window.educowork.auth.login({ id, password });
        if (!result?.success) {
          setError('아이디 또는 비밀번호가 올바르지 않습니다.');
          return false;
        }

        const token = result.token ?? '';
        sessionStorage.setItem(ADMIN_ID_STORAGE_KEY, result.adminId);
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        setAdminId(result.adminId);
        setAdminToken(token);
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
    sessionStorage.removeItem(ADMIN_ID_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    await bindAdminToken('');
    setAdminId('');
    setAdminToken('');
    setError('');
    onAuthChange?.();
  }, [onAuthChange]);

  return {
    adminId,
    adminToken,
    isLoggedIn: Boolean(adminId),
    isAdminLoggedIn: Boolean(adminId),
    login,
    logout,
    loggingIn,
    error,
    clearError: () => setError(''),
  };
}
