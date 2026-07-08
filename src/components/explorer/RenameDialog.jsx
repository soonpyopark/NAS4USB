import { useEffect, useRef, useState } from 'react';
import { splitEntryExtension, validateRenameEntryName } from '../../lib/fsPaths.js';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';

/**
 * @param {{
 *   open: boolean,
 *   entry: { name: string, isDirectory: boolean } | null,
 *   onClose: () => void,
 *   onConfirm: (name: string) => void | Promise<void>,
 * }} props
 */
export default function RenameDialog({ open, entry, onClose, onConfirm }) {
  const inputRef = useRef(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const extension =
    entry && !entry.isDirectory ? splitEntryExtension(entry.name).extension : '';

  useEffect(() => {
    if (!open || !entry) return undefined;

    const initialName = entry.isDirectory
      ? entry.name
      : splitEntryExtension(entry.name).stem;
    setName(initialName);
    setError('');
    setSubmitting(false);

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, entry]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!entry) return;

    const validation = validateRenameEntryName(name, entry.name, entry.isDirectory);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    if (validation.name === entry.name) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await onConfirm(validation.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이름을 변경할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const kindLabel = entry?.isDirectory ? '폴더' : '파일';

  return (
    <AppModal open={open && Boolean(entry)} onClose={onClose} title="이름 변경">
      <form onSubmit={handleSubmit}>
        <AppModalBody>
          {entry ? (
            <>
              {`"${entry.name}" ${kindLabel}의 새 이름을 입력해 주세요.`}
              {extension ? (
                <p className="mt-2 text-xs text-[#605e5c]">
                  확장자{extension}는 변경할 수 없습니다.
                </p>
              ) : null}
            </>
          ) : null}
        </AppModalBody>

        <div className="mb-4">
          <label htmlFor="rename-entry-name" className="mb-1 block text-xs font-medium text-[#605e5c]">
            새 이름
          </label>
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              id="rename-entry-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError('');
              }}
              disabled={submitting}
              maxLength={120}
              className="h-9 min-w-0 flex-1 rounded border border-[#8a8886] px-3 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] disabled:opacity-60"
            />
            {extension ? (
              <span className="shrink-0 rounded border border-[#edebe9] bg-[#faf9f8] px-2 py-2 text-sm text-[#605e5c]">
                {extension}
              </span>
            ) : null}
          </div>
          {error && <p className="mt-2 text-xs text-[#d13438]">{error}</p>}
        </div>

        <AppModalActions>
          <AppModalButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? '변경 중…' : '이름 변경'}
          </AppModalButton>
          <AppModalButton onClick={onClose} disabled={submitting}>
            취소
          </AppModalButton>
        </AppModalActions>
      </form>
    </AppModal>
  );
}
