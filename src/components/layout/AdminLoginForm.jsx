import { useState } from 'react';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import LoginDialog from './LoginDialog.jsx';

export default function AdminLoginForm() {
  const { isLoggedIn, login, logout, loggingIn, error, clearError } = useAdminAuthContext();
  const [open, setOpen] = useState(false);

  if (isLoggedIn) {
    return (
      <button
        type="button"
        className="h-8 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-blue-600"
        onClick={() => {
          void logout();
        }}
      >
        로그아웃
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="h-8 rounded-md bg-sky-100 px-2.5 text-[10pt] font-medium text-sky-800 transition-colors hover:bg-sky-200"
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        로그인
      </button>

      <LoginDialog
        open={open}
        loggingIn={loggingIn}
        error={error}
        dismissible
        onClose={() => {
          setOpen(false);
          clearError();
        }}
        onLogin={async (id, password, rememberMe) => {
          const ok = await login(id, password, rememberMe);
          if (ok) {
            setOpen(false);
            clearError();
          }
        }}
      />
    </>
  );
}
