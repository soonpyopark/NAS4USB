import { useEffect, useRef, useState } from 'react';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from './AppModal.jsx';

function PasswordVisibilityIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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
 *   mode: 'unlock' | 'set' | 'remove',
 *   fileName?: string,
 *   title?: string,
 *   body?: string,
 *   error?: string,
 *   busy?: boolean,
 *   onSubmit: (password: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function FilePasswordDialog({
  open,
  mode,
  fileName = '',
  title,
  body,
  error = '',
  busy = false,
  onSubmit,
  onCancel,
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, mode, fileName]);

  if (!open) return null;

  const heading =
    title ||
    (mode === 'set' ? '비밀번호 설정' : mode === 'remove' ? '비밀번호 해제' : '비밀번호 입력');
  const note =
    body ||
    (mode === 'set'
      ? `'${fileName || '파일'}'에 비밀번호를 설정합니다. 잊으면 복구할 수 없습니다.`
      : mode === 'remove'
        ? `'${fileName || '파일'}'의 비밀번호를 해제하려면 현재 비밀번호를 입력하세요.`
        : `'${fileName || '파일'}'은 비밀번호로 보호되어 있습니다.`);
  const mismatch = mode === 'set' && confirm.length > 0 && password !== confirm;
  const canSubmit =
    !busy &&
    password.length > 0 &&
    (mode !== 'set' || (password === confirm && password.length >= 1));

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(password);
  };

  return (
    <AppModal open onClose={busy ? undefined : onCancel} title={heading} raised>
      <AppModalBody>
        <p className="text-sm text-slate-600 whitespace-pre-line">{note}</p>
        <label className="mt-3 block text-sm text-slate-700">
          비밀번호
          <div className="relative mt-1">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-nas-accent"
              value={password}
              autoComplete={mode === 'set' ? 'new-password' : 'current-password'}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              aria-pressed={showPassword}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              <PasswordVisibilityIcon visible={showPassword} />
            </button>
          </div>
        </label>
        {mode === 'set' ? (
          <label className="mt-3 block text-sm text-slate-700">
            비밀번호 확인
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-nas-accent"
                value={confirm}
                autoComplete="new-password"
                disabled={busy}
                onChange={(event) => setConfirm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                aria-pressed={showPassword}
                disabled={busy}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
          </label>
        ) : null}
        {mismatch ? <p className="mt-2 text-sm text-red-600">비밀번호가 서로 다릅니다.</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </AppModalBody>
      <AppModalActions>
        <AppModalButton variant="primary" onClick={submit} disabled={!canSubmit}>
          {mode === 'set' ? '설정' : mode === 'remove' ? '해제' : '열기'}
        </AppModalButton>
        <AppModalButton onClick={onCancel} disabled={busy}>
          취소
        </AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
