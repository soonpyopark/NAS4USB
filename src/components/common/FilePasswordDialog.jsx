import { useEffect, useRef, useState } from 'react';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from './AppModal.jsx';

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
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  useEffect(() => {
    if (!open) return undefined;
    setPassword('');
    setConfirm('');
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
          <input
            ref={inputRef}
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-nas-accent"
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
        </label>
        {mode === 'set' ? (
          <label className="mt-3 block text-sm text-slate-700">
            비밀번호 확인
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-nas-accent"
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
