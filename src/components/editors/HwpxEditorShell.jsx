import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindRhwpEditor } from '../../sync/adapters/rhwpAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { loadRhwpModule } from '../../lib/rhwp/loadRhwp.js';

const RHWP_VERSION = '0.7.17';

export default function HwpxEditorShell({ relativePath, fileName, syncInfo, onClose }) {
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [contentReady, setContentReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const mountRef = useRef(null);
  const unbindRef = useRef(null);
  const hwpxBase64Ref = useRef('');

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    setContentReady(false);
    setEditorReady(false);
    setEditorHandle(null);
    setLoadError(null);

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;
        hwpxBase64Ref.current = base64;
        setContentReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load HWPX');
        }
      }
    }

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [workspace.ready, workspace.sessionId, workspace.readBinary]);

  useEffect(() => {
    if (!contentReady) return undefined;

    let cancelled = false;
    let mountAttempts = 0;
    let retryTimer = null;

    async function mountEditor() {
      if (cancelled || !mountRef.current) return;

      try {
        const rhwp = await loadRhwpModule();
        if (cancelled || !mountRef.current) return;
        if (!rhwp) {
          throw new Error('@rhwp/core 코어를 불러오지 못했습니다.');
        }

        mountRef.current.innerHTML = '';
        const editor = await rhwp.mount(mountRef.current, {
          fileName,
          relativePath,
          hwpxBase64: hwpxBase64Ref.current,
          onLoadError: (err) => {
            if (!cancelled) setLoadError(err.message);
          },
        });
        if (cancelled) {
          editor.destroy?.();
          return;
        }

        setEditorHandle(editor);
        setEditorReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to mount rhwp');
        }
      }
    }

    function tryMount() {
      if (cancelled) return;
      if (mountRef.current) {
        void mountEditor();
        return;
      }
      mountAttempts += 1;
      if (mountAttempts > 40) {
        setLoadError('rhwp 마운트 영역을 준비하지 못했습니다.');
        return;
      }
      retryTimer = window.setTimeout(tryMount, 50);
    }

    tryMount();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      unbindRef.current?.();
      unbindRef.current = null;
      setEditorHandle((current) => {
        current?.destroy?.();
        return null;
      });
    };
  }, [contentReady, fileName, relativePath]);

  useEffect(() => {
    if (!editorReady || !doc || !editorHandle) return undefined;

    unbindRef.current?.();
    unbindRef.current = bindRhwpEditor(doc, editorHandle, {
      initialBase64: hwpxBase64Ref.current,
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
  }, [editorReady, doc, editorHandle, provider]);

  const handleSave = async () => {
    if (!workspace.ready || !editorHandle) return;
    setSaving(true);
    try {
      const base64 = editorHandle.exportHwpxBase64
        ? await editorHandle.exportHwpxBase64()
        : editorHandle.getHwpxBase64?.() ?? hwpxBase64Ref.current;
      await workspace.writeBinary(base64);
      await workspace.commit();
      hwpxBase64Ref.current = base64;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    unbindRef.current?.();
    await workspace.close();
    onClose();
  };

  const peerCount = useAwarenessPeerCount(provider);
  const remotePeerCount = peerCount != null ? Math.max(0, peerCount - 1) : null;
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && (workspace.loading || !contentReady || !editorReady);
  const waitingSync = editorReady && Boolean(editorHandle) && Boolean(doc) && !bound;

  return (
    <EditorModal
      title={fileName}
      subtitle={`HWPX · room ${roomId} · ${lanEndpoints}`}
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
          ? 'rhwp 로드 실패'
          : editorHandle
            ? waitingSync
              ? `rhwp ${RHWP_VERSION} · rhwp-studio · Y.js 연결 중…`
              : remotePeerCount != null && remotePeerCount > 0
                ? `rhwp ${RHWP_VERSION} · rhwp-studio · LAN 협업 편집 (협업자 ${remotePeerCount}명 · room ${roomId})`
                : `rhwp ${RHWP_VERSION} · rhwp-studio · HWPX LAN 협업 편집 · room ${roomId} · USB 저장 시 HWPX 유지`
            : `rhwp ${RHWP_VERSION} · rhwp-studio 초기화 중…`}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-nas-muted">
            <span>HWPX 로드 및 rhwp-studio 마운트 중…</span>
            <span className="text-xs text-slate-400">큰 문서는 최대 3분까지 걸릴 수 있습니다.</span>
          </div>
        )}

        <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden" />
      </div>
    </EditorModal>
  );
}
