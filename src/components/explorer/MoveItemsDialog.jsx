import { useEffect, useRef, useState } from 'react';
import Breadcrumb from './Breadcrumb.jsx';
import {
  formatDataPath,
  isBlockedMoveFolder,
  listMoveDestinationFolders,
  validateMoveDestination,
} from '../../lib/moveEntries.js';
import { getParentPath } from '../../lib/fsPaths.js';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';

/**
 * @param {{
 *   open: boolean,
 *   entries: import('../../types/nas4usb.d.ts').FsEntry[],
 *   initialPath?: string,
 *   title?: string,
 *   confirmLabel?: string,
 *   submittingLabel?: string,
 *   summary?: string,
 *   validateDestination?: (
 *     entries: import('../../types/nas4usb.d.ts').FsEntry[],
 *     destinationPath: string,
 *   ) => { ok: boolean, error?: string },
 *   onClose: () => void,
 *   onConfirm: (destinationPath: string) => void | Promise<void>,
 * }} props
 */
export default function MoveItemsDialog({
  open,
  entries,
  initialPath = '.',
  title = '이동',
  confirmLabel = '여기로 이동',
  submittingLabel = '이동 중…',
  summary: summaryOverride,
  validateDestination = validateMoveDestination,
  onClose,
  onConfirm,
}) {
  const [browsePath, setBrowsePath] = useState(initialPath);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const browsePathRef = useRef(browsePath);
  browsePathRef.current = browsePath;

  const goTo = (folderPath) => {
    browsePathRef.current = folderPath;
    setBrowsePath(folderPath);
  };

  useEffect(() => {
    if (!open) return undefined;

    goTo(initialPath);
    setError('');
    setSubmitting(false);
    return undefined;
  }, [open, initialPath]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    async function loadFolders() {
      setLoading(true);
      setError('');

      try {
        const result = await listMoveDestinationFolders(browsePath);
        if (!cancelled) setFolders(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '폴더 목록을 불러오지 못했습니다.');
          setFolders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFolders();

    return () => {
      cancelled = true;
    };
  }, [open, browsePath]);

  const destinationValidation = validateDestination(entries, browsePath);
  const canMove = destinationValidation.ok && !submitting;

  const handleSubmit = async () => {
    if (!canMove) return;

    const dest = browsePathRef.current;
    setSubmitting(true);
    setError('');

    try {
      await onConfirm(dest);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이동에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const summary =
    summaryOverride ??
    (entries.length === 1 ? `"${entries[0].name}" 이동` : `${entries.length}개 항목 이동`);

  return (
    <AppModal open={open} onClose={onClose} title={title} wide>
      <AppModalBody className="!mb-3">{summary}</AppModalBody>

      <div className="mb-3 rounded border border-[#e1dfdd] bg-[#faf9f8] px-3 py-2">
        <p className="mb-1 text-[10pt] font-medium text-[#605e5c]">대상 폴더</p>
        <p className="truncate text-[10pt] text-[#323130]" title={formatDataPath(browsePath)}>
          {formatDataPath(browsePath)}
        </p>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="nas-btn-ghost"
          disabled={browsePath === '.' || submitting}
          onClick={() => goTo(getParentPath(browsePath))}
        >
          상위
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumb currentPath={browsePath} onNavigate={goTo} />
        </div>
      </div>

      <div className="mb-4 max-h-56 overflow-y-auto rounded border border-[#e1dfdd]">
        {loading && (
          <p className="px-3 py-4 text-center text-[10pt] text-[#605e5c]">폴더 목록 불러오는 중…</p>
        )}

        {!loading && folders.length === 0 && (
          <p className="px-3 py-4 text-center text-[10pt] text-[#605e5c]">하위 폴더가 없습니다</p>
        )}

        {!loading &&
          folders.map((folder) => {
            const blocked = isBlockedMoveFolder(folder.relativePath, entries);

            return (
              <button
                key={folder.relativePath}
                type="button"
                disabled={blocked || submitting}
                title={blocked ? '이동할 수 없는 폴더입니다' : folder.name}
                className="flex w-full items-center gap-2 border-b border-[#edebe9] px-3 py-2 text-left text-[10pt] text-[#323130] transition-colors last:border-b-0 enabled:hover:bg-[#f3f2f1] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => goTo(folder.relativePath)}
              >
                <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                <span className="truncate">{folder.name}</span>
              </button>
            );
          })}
      </div>

      {!destinationValidation.ok && (
        <p className="mb-3 text-[10pt] text-[#d13438]">{destinationValidation.error}</p>
      )}
      {error && <p className="mb-3 text-[10pt] text-[#d13438]">{error}</p>}

      <AppModalActions>
        <AppModalButton variant="primary" disabled={!canMove} onClick={handleSubmit}>
          {submitting ? submittingLabel : confirmLabel}
        </AppModalButton>
        <AppModalButton onClick={onClose} disabled={submitting}>
          취소
        </AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
