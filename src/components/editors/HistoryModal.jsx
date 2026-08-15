import { useCallback, useEffect, useState } from 'react';
import { AppModal, AppConfirmDialog } from '../common/AppModal.jsx';
import HistoryPreviewModal from './HistoryPreviewModal.jsx';
import { getShareTokenFromUrl } from '../../lib/shareAccess.js';

/** @param {string} iso */
function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Revision-history list for a single file (max 10 entries kept server-side).
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   onRestored: (base64: string, sidecarSheets?: import('@fortune-sheet/core').Sheet[] | null) => void | Promise<void>,
 * }} props
 */
export default function HistoryModal({ open, onClose, relativePath, fileName, extension, onRestored }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyEntryId, setBusyEntryId] = useState(null);
  const [previewEntryId, setPreviewEntryId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(
    /** @type {{ type: 'delete' | 'restore' | 'deleteAll', entryId?: string } | null} */ (null),
  );
  const busy = busyEntryId != null;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.nas4usb.history.list(relativePath, getShareTokenFromUrl());
      setEntries(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [relativePath]);

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open, reload]);

  const handleDelete = async (entryId) => {
    setBusyEntryId(entryId);
    setError(null);
    try {
      await window.nas4usb.history.deleteEntry(relativePath, entryId, getShareTokenFromUrl());
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      // The preview modal can't show content for an entry that no longer exists.
      setPreviewEntryId((current) => (current === entryId ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력 삭제에 실패했습니다.');
    } finally {
      setBusyEntryId(null);
      setConfirmAction(null);
    }
  };

  const handleDeleteAll = async () => {
    const targets = entries.map((entry) => entry.id);
    if (!targets.length) {
      setConfirmAction(null);
      return;
    }
    setBusyEntryId('all');
    setError(null);
    try {
      for (const entryId of targets) {
        await window.nas4usb.history.deleteEntry(relativePath, entryId, getShareTokenFromUrl());
      }
      setEntries([]);
      setPreviewEntryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력 일괄 삭제에 실패했습니다.');
      await reload();
    } finally {
      setBusyEntryId(null);
      setConfirmAction(null);
    }
  };

  const handleRestore = async (entryId) => {
    setBusyEntryId(entryId);
    setError(null);
    try {
      const result = await window.nas4usb.history.restore(relativePath, entryId, getShareTokenFromUrl());
      await onRestored?.(result?.base64 ?? '', result?.sidecarSheets ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력 복원에 실패했습니다.');
    } finally {
      setBusyEntryId(null);
      setConfirmAction(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <AppModal
        open
        onClose={onClose}
        title={`${fileName} — 백업 내역`}
        wide
        showCloseButton
        className="modal-dialog--history"
        headerActions={
          <button
            type="button"
            className="nas-btn-ghost text-red-600"
            disabled={busy || loading || entries.length === 0}
            onClick={() => setConfirmAction({ type: 'deleteAll' })}
          >
            일괄삭제
          </button>
        }
      >
        {error && <p className="modal-body text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="modal-body text-sm text-nas-muted">불러오는 중…</p>
        ) : entries.length === 0 ? (
          <p className="modal-body text-sm text-nas-muted">저장된 백업 내역이 없습니다.</p>
        ) : (
          <div className="modal-body flex flex-col gap-2">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className="flex flex-nowrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPreviewEntryId(entry.id)}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="min-w-0 whitespace-nowrap text-sm font-medium text-[#323130]">
                    {index === 0 ? '최신 이력' : `이력 ${entries.length - index}`} · {formatTimestamp(entry.createdAt)}
                    {' · '}
                    {formatSize(entry.size)}
                  </p>
                </button>
                <button
                  type="button"
                  className="nas-btn-ghost shrink-0 text-red-600"
                  disabled={busy}
                  onClick={() => setConfirmAction({ type: 'delete', entryId: entry.id })}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </AppModal>

      <HistoryPreviewModal
        open={previewEntryId != null}
        onClose={() => setPreviewEntryId(null)}
        relativePath={relativePath}
        fileName={fileName}
        extension={extension}
        entryId={previewEntryId}
        busy={busyEntryId === previewEntryId}
        onRequestRestore={(entryId) => setConfirmAction({ type: 'restore', entryId })}
        onRequestDelete={(entryId) => setConfirmAction({ type: 'delete', entryId })}
      />

      <AppConfirmDialog
        open={confirmAction != null}
        title={
          confirmAction?.type === 'restore'
            ? '이력 복원'
            : confirmAction?.type === 'deleteAll'
              ? '백업 일괄삭제'
              : '이력 삭제'
        }
        body={
          confirmAction?.type === 'restore'
            ? '선택한 이력으로 현재 문서를 대체합니다. 현재 내용은 저장하지 않으면 사라지며, 되돌릴 수 없습니다. 계속하시겠습니까?'
            : confirmAction?.type === 'deleteAll'
              ? `이 파일의 백업 내역 ${entries.length}개를 모두 삭제할까요?\n\n원본 파일은 그대로 두고 백업만 제거됩니다. 이 작업은 되돌릴 수 없습니다.`
              : '선택한 이력을 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?'
        }
        confirmLabel={
          confirmAction?.type === 'restore'
            ? '복원'
            : confirmAction?.type === 'deleteAll'
              ? '일괄삭제'
              : '삭제'
        }
        confirmVariant={confirmAction?.type === 'restore' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'restore') {
            handleRestore(confirmAction.entryId);
          } else if (confirmAction.type === 'deleteAll') {
            handleDeleteAll();
          } else if (confirmAction.entryId) {
            handleDelete(confirmAction.entryId);
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
