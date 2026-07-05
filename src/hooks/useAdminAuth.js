import { useCallback, useState } from 'react';

const STORAGE_KEY = 'educowork.adminSession';

function readStoredAdminId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useAdminAuth() {
  const [adminId, setAdminId] = useState(readStoredAdminId);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (id, password) => {
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

      sessionStorage.setItem(STORAGE_KEY, result.adminId);
      setAdminId(result.adminId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      return false;
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminId('');
    setError('');
  }, []);

  return {
    adminId,
    isLoggedIn: Boolean(adminId),
    login,
    logout,
    loggingIn,
    error,
    clearError: () => setError(''),
  };
}
