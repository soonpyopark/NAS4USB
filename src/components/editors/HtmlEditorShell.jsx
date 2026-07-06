import { useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import TipTapEditor from './TipTapEditor.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindRhwpEditor } from '../../sync/adapters/rhwpAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { decodeTextBase64, encodeTextBase64 } from '../../lib/text/textIO.js';
import { serializeHtmlForFile, unwrapHtmlDocument } from '../../lib/tiptap/htmlDocument.js';

/**
 * @param {{ relativePath: string, fileName: string, syncInfo: object, onClose: () => void, allowClose?: boolean, fullscreen?: boolean }} props
 */
export default function HtmlEditorShell({
  relativePath,
  fileName,
  syncInfo,
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialHtml, setInitialHtml] = useState('');
  const [ready, setReady] = useState(false);
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const unbindRef = useRef(null);
  const initialHtmlRef = useRef('');
  const editorHandleRef = useRef(null);

  useEffect(() => {
    editorHandleRef.current = editorHandle;
  }, [editorHandle]);

  useEffect(() => {
    if (!workspace.ready || !doc) return undefined;

    let cancelled = false;

    async function bootstrap() {
      try {
        const base64 = await workspace.readBinary();
        const text = decodeTextBase64(base64);
        const html = unwrapHtmlDocument(text);
        if (cancelled) return;

        initialHtmlRef.current = html;
        setInitialHtml(html);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load HTML file');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      unbindRef.current?.();
      unbindRef.current = null;
    };
  }, [workspace.ready, workspace.sessionId, doc]);

  useEffect(() => {
    if (!ready || !doc || !editorHandle || !synced) return undefined;

    unbindRef.current?.();
    unbindRef.current = bindRhwpEditor(doc, editorHandle, {
      initialHtml: initialHtmlRef.current,
      synced: true,
      provider,
    });
    setBound(true);

    return () => {
      unbindRef.current?.();
      unbindRef.current = null;
      editorHandle.setEditable?.(false);
      setBound(false);
    };
  }, [ready, doc, editorHandle, provider, synced]);

  const handleEditorReady = useCallback((handle) => {
    setEditorHandle(handle);
  }, []);

  const handleSave = useCallback(async () => {
    if (!workspace.ready || !editorHandleRef.current) return;
    setSaving(true);
    try {
      const base64 = encodeTextBase64(
        serializeHtmlForFile(editorHandleRef.current.getHtml(), fileName),
      );
      await workspace.writeBinary(base64);
      await workspace.commit();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workspace]);

  const handleClose = async () => {
    unbindRef.current?.();
    await workspace.close();
    onClose();
  };

  const peerCount = useAwarenessPeerCount(provider);
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = workspace.loading || !doc || !ready;
  const waitingSync = ready && Boolean(editorHandle) && !bound;

  return (
    <EditorModal
      title={fileName}
      subtitle={`HTML · TipTap · room ${roomId} · ${lanEndpoints}`}
      status={status}
      synced={synced}
      peerCount={peerCount}
      saving={saving}
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
        {waitingSync
          ? 'HTML 에디터 · Y.js 동기화 후 편집 가능'
          : 'HTML 에디터 · 표/중첩 표 · HTML 소스 보기 · Ctrl+S 저장 · LAN 실시간 동시 편집'}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
          파일 로드 및 Y.js 세션 준비 중…
        </div>
      ) : (
        <TipTapEditor initialHtml={initialHtml} onReady={handleEditorReady} />
      )}
    </EditorModal>
  );
}
