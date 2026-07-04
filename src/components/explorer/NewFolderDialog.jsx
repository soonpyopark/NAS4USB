import { useEffect, useRef, useState } from 'react';
import { validateFolderName } from '../../lib/fsPaths.js';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onConfirm: (name: string) => void | Promise<void>,
 * }} props
 */
export default function NewFolderDialog({ open, onClose, onConfirm }) {
  const inputRef = useRef(null);
  const [name, setName] = useState('새 폴더');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    setName('새 폴더');
    setError('');
    setSubmitting(false);

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validation = validateFolderName(name);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await onConfirm(validation.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '폴더를 만들 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <form onSubmit={handleSubmit}>
          <header className="border-b border-nas-border px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">새 폴더 만들기</h2>
            <p className="text-xs text-nas-muted">현재 폴더에 하위 폴더를 추가합니다.</p>
          </header>

          <div className="space-y-2 px-4 py-4">
            <label htmlFor="new-folder-name" className="block text-xs font-medium text-slate-600">
              폴더 이름
            </label>
            <input
              ref={inputRef}
              id="new-folder-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError('');
              }}
              disabled={submitting}
              maxLength={120}
              className="h-9 w-full rounded-md border border-nas-border px-3 text-sm outline-none focus:border-nas-accent focus:ring-1 focus:ring-nas-accent disabled:opacity-60"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <footer className="flex justify-end gap-2 border-t border-nas-border px-4 py-3">
            <button type="button" className="nas-btn-ghost" onClick={onClose} disabled={submitting}>
              취소
            </button>
            <button type="submit" className="nas-btn-primary" disabled={submitting}>
              {submitting ? '만드는 중…' : '만들기'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
