import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import FortuneSheetGrid from './FortuneSheetGrid.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindFortuneSheetEditor, setWorkbookSnapshot } from '../../sync/adapters/xlsxAdapter.js';
import { bindFortuneSheetPresence } from '../../sync/adapters/xlsxPresenceAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { buildSpreadsheetBase64 } from '../../lib/xlsx/xlsxIO.js';
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
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialSheets, setInitialSheets] = useState(null);
  const [diskRevision, setDiskRevision] = useState('');
  const [sheetSummary, setSheetSummary] = useState('Sheet1');
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const unbindRef = useRef(null);
  const unbindPresenceRef = useRef(null);
  const diskRevisionRef = useRef('');
  diskRevisionRef.current = diskRevision;

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
      await writeFortuneSidecar(relativePath, sheets);
      const base64 = buildSpreadsheetBase64(sheets, { bookType });
      await workspace.writeBinary(base64);
      await workspace.commit();
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

  const peerCount = useAwarenessPeerCount(provider);
  const remotePeerCount = peerCount != null ? Math.max(0, peerCount - 1) : null;
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && !workspace.error && (workspace.loading || initialSheets == null || !editorHandle);
  const waitingSync = Boolean(editorHandle) && Boolean(doc) && !bound;

  return (
    <EditorModal
      title={fileName}
      subtitle={`${sheetSummary} · FortuneSheet · room ${roomId} · ${lanEndpoints}`}
      status={status}
      synced={synced}
      peerCount={peerCount}
      saving={saving}
      saveDisabled={shareReadOnly || waitingSync}
      hideSave={shareReadOnly}
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
            <FortuneSheetGrid
              initialSheets={initialSheets}
              onReady={(editor) => setEditorHandle(editor)}
            />
          </div>
        )}
      </div>
    </EditorModal>
  );
}
