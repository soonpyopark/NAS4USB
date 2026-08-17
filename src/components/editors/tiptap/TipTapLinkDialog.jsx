import { useEffect, useRef, useState } from 'react';
import { AppModal, AppModalActions, AppModalButton } from '../../common/AppModal.jsx';

/**
 * In-app link editor. Electron does not show `window.prompt`.
 *
 * @param {{
 *   open: boolean,
 *   href?: string,
 *   onApply: (href: string) => void,
 *   onRemove: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function TipTapLinkDialog({ open, href = '', onApply, onRemove, onCancel }) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [value, setValue] = useState(href);
  const existing = Boolean(String(href || '').trim());

  useEffect(() => {
    if (!open) return;
    setValue(href || 'https://');
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, href]);

  if (!open) return null;

  const submit = () => {
    onApply(value.trim());
  };

  return (
    <AppModal open={open} onClose={onCancel} title="링크" raised>
      <div className="modal-body space-y-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">URL</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-nas-accent"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
      </div>
      <AppModalActions className="flex-wrap">
        <AppModalButton variant="primary" onClick={submit}>
          적용
        </AppModalButton>
        {existing ? (
          <AppModalButton variant="danger" onClick={onRemove}>
            링크 제거
          </AppModalButton>
        ) : null}
        <AppModalButton onClick={onCancel}>취소</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
