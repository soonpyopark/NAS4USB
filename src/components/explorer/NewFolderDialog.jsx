import { useEffect, useRef, useState } from 'react';
import { validateFolderName } from '../../lib/fsPaths.js';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';

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
    <AppModal open={open} onClose={onClose} title="새 폴더 만들기">
      <form onSubmit={handleSubmit}>
        <AppModalBody>현재 폴더에 하위 폴더를 추가합니다.</AppModalBody>

        <div className="mb-4">
          <label htmlFor="new-folder-name" className="mb-1 block text-xs font-medium text-[#605e5c]">
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
            className="h-9 w-full rounded border border-[#8a8886] px-3 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] disabled:opacity-60"
          />
          {error && <p className="mt-2 text-xs text-[#d13438]">{error}</p>}
        </div>

        <AppModalActions>
          <AppModalButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? '만드는 중…' : '만들기'}
          </AppModalButton>
          <AppModalButton onClick={onClose} disabled={submitting}>
            취소
          </AppModalButton>
        </AppModalActions>
      </form>
    </AppModal>
  );
}
