import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import FortuneSheetGrid from './FortuneSheetGrid.jsx';
import HistoryModal from './HistoryModal.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindFortuneSheetEditor, setWorkbookSnapshot } from '../../sync/adapters/xlsxAdapter.js';
import { bindFortuneSheetPresence } from '../../sync/adapters/xlsxPresenceAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { buildSpreadsheetBase64, parseSpreadsheetBase64 } from '../../lib/xlsx/xlsxIO.js';
import { loadSpreadsheetDocument, writeFortuneSidecar } from '../../lib/xlsx/fortuneSidecar.js';

const FORTUNE_SHEET_VERSION = '1.0.4';

export default function XlsxEditorShell({
  relativePath,
  fileName,
  syncInfo,
  onClose,
  allowClose = true,
  fullscreen = false,
  readOnly: shareReadOnly = false,
}) {
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: true,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialSheets, setInitialSheets] = useState(null);
  const [diskRevision, setDiskRevision] = useState('');
  const [sheetSummary, setSheetSummary] = useState('Sheet1');
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const unbindRef = useRef(null);
  const unbindPresenceRef = useRef(null);
  const diskRevisionRef = useRef('');
  const crashCountRef = useRef(0);
  diskRevisionRef.current = diskRevision;

  // FortuneSheet occasionally throws while applying a remote collaboration op
  // (e.g. another peer adding a sheet). Rather than leaving a blank/white
  // screen with no error boundary, force a full remount so the editor
  // re-bootstraps from the latest Y.js snapshot instead of replaying ops.
  const handleGridCrash = (error) => {
    // eslint-disable-next-line no-console
    console.warn('FortuneSheet editor crashed, recovering by remounting.', error);
    crashCountRef.current += 1;
    if (crashCountRef.current > 5) {
      setLoadError('스프레드시트 편집기에서 반복적인 오류가 발생했습니다. 새로고침 해 주세요.');
      return;
    }
    setEditorHandle(null);
    setBound(false);
    setRecoveryKey((key) => key + 1);
  };

  useEffect(() => {
    setInitialSheets(null);
    setEditorHandle(null);
    setBound(false);
    setLoadError(null);
    setDiskRevision('');
  }, [relativePath]);

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    setLoadError(null);

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;

        let nextDiskRevision = '';
        try {
          const statInfo = await window.nas4usb.fs.stat(relativePath);
          nextDiskRevision = statInfo?.modifiedAt ?? '';
        } catch {
          // diskRevision is optional; load should still succeed.
        }

        const parsed = await loadSpreadsheetDocument(relativePath, base64);
        if (cancelled) return;
        setSheetSummary(
          parsed.sheetNames.length > 1
            ? `${parsed.sheetNames.length} sheets`
            : parsed.sheetName,
        );
        setInitialSheets(parsed.sheets);
        setDiskRevision(nextDiskRevision);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
        }
      }
    }

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [workspace.ready, workspace.sessionId, workspace.readBinary, relativePath]);

  useEffect(() => {
    if (!editorHandle || !doc || initialSheets == null) return undefined;

    unbindRef.current?.();
    unbindPresenceRef.current?.();
    unbindRef.current = null;
    unbindPresenceRef.current = null;
    setBound(false);

    try {
      unbindRef.current = bindFortuneSheetEditor(doc, editorHandle, {
        initialSheets,
        provider,
        diskRevision: diskRevisionRef.current,
      });
      unbindPresenceRef.current = bindFortuneSheetPresence(provider, editorHandle);
      setBound(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to bind spreadsheet editor');
    }

    return () => {
      unbindRef.current?.();
      unbindPresenceRef.current?.();
      unbindRef.current = null;
      unbindPresenceRef.current = null;
      setBound(false);
    };
  }, [editorHandle, doc, initialSheets, provider]);

  const handleSave = async () => {
    if (shareReadOnly) return;
    if (!workspace.ready || !editorHandle) return;
    setSaving(true);
    try {
      const bookType = fileName.toLowerCase().endsWith('.xls') ? 'biff8' : 'xlsx';
      const sheets = editorHandle.getSheets();
      const base64 = buildSpreadsheetBase64(sheets, { bookType });
      await workspace.writeBinary(base64);
      // commit() (via archiveCurrentVersion) snapshots whatever is *currently* on disk — both the
      // xlsx file and its `.fortune.json` sidecar — as the new history entry, so the sidecar must
      // not be overwritten with this save's content until after it returns.
      await workspace.commit();
      await writeFortuneSidecar(relativePath, sheets);
      const statInfo = await window.nas4usb.fs.stat(relativePath);
      const nextDiskRevision = statInfo?.modifiedAt ?? '';
      setDiskRevision(nextDiskRevision);
      if (doc) {
        setWorkbookSnapshot(doc, sheets, { diskRevision: nextDiskRevision });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    unbindRef.current?.();
    unbindPresenceRef.current?.();
    editorHandle?.destroy?.();
    await workspace.close();
    onClose();
  };

  // Restore already overwrote the file on disk (and archived the pre-restore state). The
  // backend also returns the entry's archived `.fortune.json` sidecar sheets when available
  // (sidecarSheets) — those carry FortuneSheet-only extras like inserted images that plain XLSX
  // bytes can never represent, so prefer them over re-parsing the (lossy) restored bytes.
  const handleRestoreHistory = async (base64, sidecarSheets) => {
    let sheets;
    let summary;
    if (Array.isArray(sidecarSheets) && sidecarSheets.length > 0) {
      sheets = sidecarSheets;
      summary = sheets.length > 1 ? `${sheets.length} sheets` : sheets[0]?.name;
    } else {
      const parsed = await parseSpreadsheetBase64(base64);
      sheets = parsed.sheets;
      summary = parsed.sheetNames.length > 1 ? `${parsed.sheetNames.length} sheets` : parsed.sheetName;
    }

    await writeFortuneSidecar(relativePath, sheets);
    editorHandle?.updateSheets(sheets);
    setSheetSummary(summary);
    await workspace.writeBinary(base64);
    let nextDiskRevision = '';
    try {
      const statInfo = await window.nas4usb.fs.stat(relativePath);
      nextDiskRevision = statInfo?.modifiedAt ?? '';
    } catch {
      // diskRevision is optional
    }
    setDiskRevision(nextDiskRevision);
    if (doc) {
      setWorkbookSnapshot(doc, sheets, { diskRevision: nextDiskRevision });
    }
  };

  const peerCount = useAwarenessPeerCount(provider);
  const remotePeerCount = peerCount != null ? Math.max(0, peerCount - 1) : null;
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && !workspace.error && (workspace.loading || initialSheets == null || !editorHandle);
  const waitingSync = Boolean(editorHandle) && Boolean(doc) && !bound;

  return (
    <>
      <EditorModal
        title={fileName}
        subtitle={`${sheetSummary} · FortuneSheet · room ${roomId} · ${lanEndpoints}`}
        status={status}
        synced={synced}
        peerCount={peerCount}
        saving={saving}
        saveDisabled={shareReadOnly || waitingSync}
        hideSave={shareReadOnly}
        hideHistory={shareReadOnly}
        onShowHistory={() => setShowHistory(true)}
        onSave={handleSave}
        onClose={handleClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      >
        {(workspace.error || loadError) && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {workspace.error || loadError}
          </div>
        )}

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-nas-muted">
          {shareReadOnly
            ? `FortuneSheet ${FORTUNE_SHEET_VERSION} · 공유(보기 전용) · 편집·저장 불가`
            : loadError
              ? 'FortuneSheet 로드 실패'
              : editorHandle
                ? waitingSync
                  ? `FortuneSheet ${FORTUNE_SHEET_VERSION} · Y.js 연결 중…`
                  : remotePeerCount != null && remotePeerCount > 0
                    ? `FortuneSheet ${FORTUNE_SHEET_VERSION} · LAN 협업 편집 (협업자 ${remotePeerCount}명 · 서식·시트 포함 · room ${roomId})`
                    : `FortuneSheet ${FORTUNE_SHEET_VERSION} · 스프레드시트 LAN 협업 · room ${roomId} · 저장 시 서식·이미지 등 전체 상태 보존`
                : `FortuneSheet ${FORTUNE_SHEET_VERSION} · 편집기 초기화 중…`}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-nas-muted">
              <span>스프레드시트 로드 및 FortuneSheet 마운트 중…</span>
            </div>
          )}

          {initialSheets != null && (
            <div className={shareReadOnly ? 'pointer-events-none min-h-0 flex-1 select-none' : 'min-h-0 flex-1'}>
              <ErrorBoundary
                key={recoveryKey}
                onError={handleGridCrash}
                fallback={(
                  <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-nas-muted">
                    편집기를 복구하는 중…
                  </div>
                )}
              >
                <FortuneSheetGrid
                  initialSheets={initialSheets}
                  onReady={(editor) => setEditorHandle(editor)}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </EditorModal>

      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        relativePath={relativePath}
        fileName={fileName}
        extension={fileName.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'}
        onRestored={handleRestoreHistory}
      />
    </>
  );
}
