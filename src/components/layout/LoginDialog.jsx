import { useEffect, useRef, useState } from 'react';

const fieldClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15';

function PasswordVisibilityIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
      />
    </svg>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   loggingIn?: boolean,
 *   error?: string,
 *   onClose: () => void,
 *   onLogin: (id: string, password: string, rememberMe: boolean) => void | Promise<void>,
 *   dismissible?: boolean,
 * }} props
 */
export default function LoginDialog({
  open,
  loggingIn = false,
  error = '',
  onClose,
  onLogin,
  dismissible = true,
}) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const idInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setId('');
    setPassword('');
    setShowPassword(false);
    setRememberMe(true);

    let cancelled = false;
    let attempts = 0;
    const tryFocus = () => {
      if (cancelled) return;
      const el = idInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      attempts += 1;
      if (document.activeElement !== el && attempts < 10) {
        window.setTimeout(tryFocus, 50);
      }
    };
    const timer = window.setTimeout(tryFocus, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    void onLogin(id.trim(), password, rememberMe);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(32,33,36,0.32)] p-4"
      onClick={dismissible ? onClose : undefined}
      role="presentation"
    >
      <form
        className="relative w-full max-w-[360px] rounded-xl bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
      >
        {dismissible && (
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
            onClick={onClose}
            disabled={loggingIn}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z"
              />
            </svg>
          </button>
        )}
        <h2 id="login-dialog-title" className="m-0 text-lg font-medium text-slate-900">
          로그인
        </h2>
        <p className="mt-1 text-sm text-slate-500">회원 계정으로 로그인한 뒤 NAS4USB를 이용합니다.</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-600">
            아이디
            <input
              ref={idInputRef}
              type="text"
              className={`${fieldClass} mt-1`}
              value={id}
              autoComplete="username"
              disabled={loggingIn}
              onChange={(event) => setId(event.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            비밀번호
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`${fieldClass} pr-10`}
                value={password}
                autoComplete="current-password"
                disabled={loggingIn}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                aria-pressed={showPassword}
                disabled={loggingIn}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-[#c5221f]">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-sky-600"
              checked={rememberMe}
              disabled={loggingIn}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            로그인 유지
          </label>
          <div className="flex justify-end gap-2">
            {dismissible ? (
              <button
                type="button"
                className="rounded-full px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                onClick={onClose}
                disabled={loggingIn}
              >
                취소
              </button>
            ) : null}
            <button
              type="submit"
              className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              disabled={loggingIn || !id.trim() || !password}
            >
              {loggingIn ? '로그인 중…' : '로그인'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
