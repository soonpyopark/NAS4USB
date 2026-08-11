import { useLoginDialog } from '../../context/LoginDialogContext.jsx';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';

export default function AdminLoginForm() {
  const { isLoggedIn, logout } = useAdminAuthContext();
  const { openLogin } = useLoginDialog();

  if (isLoggedIn) {
    return (
      <button
        type="button"
        className="h-8 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-nas-accentHover"
        onClick={() => {
          void logout();
        }}
      >
        로그아웃
      </button>
    );
  }

  return (
    <button
      type="button"
      className="h-8 rounded-md bg-nas-accentSoft px-2.5 text-[10pt] font-medium text-nas-accentText transition-colors hover:bg-nas-accentSoftHover"
      onClick={() => openLogin()}
    >
      로그인
    </button>
  );
}
