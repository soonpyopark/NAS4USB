import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import FortuneSheetGrid from './FortuneSheetGrid.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindFortuneSheetEditor } from '../../sync/adapters/xlsxAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { parseSpreadsheetBase64, buildSpreadsheetBase64 } from '../../lib/xlsx/xlsxIO.js';

const FORTUNE_SHEET_VERSION = '1.0.4';

export default function XlsxEditorShell({ relativePath, fileName, syncInfo, onClose }) {
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialSheets, setInitialSheets] = useState(null);
  const [sheetSummary, setSheetSummary] = useState('Sheet1');
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const unbindRef = useRef(null);

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    setInitialSheets(null);
    setEditorHandle(null);
    setBound(false);
    setLoadError(null);

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;
        const parsed = parseSpreadsheetBase64(base64);
        setSheetSummary(
          parsed.sheetNames.length > 1
            ? `${parsed.sheetNames.length} sheets`
            : parsed.sheetName,
        );
        setInitialSheets(parsed.sheets);
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
  }, [workspace.ready, workspace.sessionId, workspace.readBinary]);

  useEffect(() => {
    if (!editorHandle || !doc || initialSheets == null) return undefined;

    unbindRef.current?.();
    unbindRef.current = bindFortuneSheetEditor(doc, editorHandle, {
      initialSheets,
      provider,
    });
    setBound(true);

    return () => {
      unbindRef.current?.();
      unbindRef.current = null;
      setBound(false);
    };
  }, [editorHandle, doc, initialSheets, provider]);

  const handleSave = async () => {
    if (!workspace.ready || !editorHandle) return;
    setSaving(true);
    try {
      const bookType = fileName.toLowerCase().endsWith('.xls') ? 'biff8' : 'xlsx';
      const base64 = buildSpreadsheetBase64(editorHandle.getSheets(), { bookType });
      await workspace.writeBinary(base64);
      await workspace.commit();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    unbindRef.current?.();
    editorHandle?.destroy?.();
    await workspace.close();
    onClose();
  };

  const peerCount = useAwarenessPeerCount(provider);
  const remotePeerCount = peerCount != null ? Math.max(0, peerCount - 1) : null;
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && (workspace.loading || initialSheets == null || !editorHandle);
  const waitingSync = Boolean(editorHandle) && Boolean(doc) && !bound;

  return (
    <EditorModal
      title={fileName}
      subtitle={`${sheetSummary} · FortuneSheet · room ${roomId} · ${lanEndpoints}`}
      status={status}
      synced={synced}
      peerCount={peerCount}
      saving={saving}
      onSave={handleSave}
      onClose={handleClose}
    >
      {(workspace.error || loadError) && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {workspace.error || loadError}
        </div>
      )}

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-nas-muted">
        {loadError
          ? 'FortuneSheet 로드 실패'
          : editorHandle
            ? waitingSync
              ? `FortuneSheet ${FORTUNE_SHEET_VERSION} · Y.js 연결 중…`
              : remotePeerCount != null && remotePeerCount > 0
                ? `FortuneSheet ${FORTUNE_SHEET_VERSION} · LAN 협업 편집 (협업자 ${remotePeerCount}명 · 서식·시트 포함 · room ${roomId})`
                : `FortuneSheet ${FORTUNE_SHEET_VERSION} · 스프레드시트 LAN 협업 · room ${roomId} · USB 저장 시 XLS/XLSX 유지`
            : `FortuneSheet ${FORTUNE_SHEET_VERSION} · 편집기 초기화 중…`}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-nas-muted">
            <span>스프레드시트 로드 및 FortuneSheet 마운트 중…</span>
          </div>
        )}

        {initialSheets != null && (
          <FortuneSheetGrid
            initialSheets={initialSheets}
            onReady={(editor) => setEditorHandle(editor)}
          />
        )}
      </div>
    </EditorModal>
  );
}
