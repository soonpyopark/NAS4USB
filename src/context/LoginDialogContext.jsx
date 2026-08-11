import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAdminAuthContext } from './AdminAuthContext.jsx';
import LoginDialog from '../components/layout/LoginDialog.jsx';

/**
 * @typedef {{
 *   openLogin: () => void,
 *   closeLogin: () => void,
 *   isLoginOpen: boolean,
 * }} LoginDialogContextValue
 */

/** @type {import('react').Context<LoginDialogContextValue | null>} */
const LoginDialogContext = createContext(null);

export function LoginDialogProvider({ children }) {
  const { login, loggingIn, error, clearError, isLoggedIn } = useAdminAuthContext();
  const [open, setOpen] = useState(false);

  const openLogin = useCallback(() => {
    if (isLoggedIn) return;
    clearError();
    setOpen(true);
  }, [clearError, isLoggedIn]);

  const closeLogin = useCallback(() => {
    setOpen(false);
    clearError();
  }, [clearError]);

  const value = useMemo(
    () => ({
      openLogin,
      closeLogin,
      isLoginOpen: open,
    }),
    [openLogin, closeLogin, open],
  );

  return (
    <LoginDialogContext.Provider value={value}>
      {children}
      <LoginDialog
        open={open && !isLoggedIn}
        loggingIn={loggingIn}
        error={error}
        dismissible
        onClose={closeLogin}
        onLogin={async (id, password, rememberMe) => {
          const ok = await login(id, password, rememberMe);
          if (ok) {
            closeLogin();
          }
        }}
      />
    </LoginDialogContext.Provider>
  );
}

export function useLoginDialog() {
  const context = useContext(LoginDialogContext);
  if (!context) {
    throw new Error('useLoginDialog must be used within LoginDialogProvider');
  }
  return context;
}
