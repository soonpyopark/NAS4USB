import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { getLanWsEndpoints, getSyncServerUrl } from '../../sync/buildWsUrl.js';
import { loadWb4sModule } from '../../lib/wb4s/loadWb4s.js';
import { base64ToUtf8, normalizeWb4sDocument, utf8ToBase64 } from '../../../lib/wb4s/wb4sDocument.js';
import { loadUserDisplayName } from '../../lib/userProfile.js';

const WB4S_VERSION = '1.0.2';

export default function Wb4sEditorShell({ relativePath, fileName, syncInfo, onClose }) {
  const workspace = useWorkspaceSession(relativePath);
  const { status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [contentReady, setContentReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [collabReady, setCollabReady] = useState(false);
  const [userName, setUserName] = useState('사용자');
  const [remotePeerCount, setRemotePeerCount] = useState(0);
  const mountRef = useRef(null);
  const editorRef = useRef(null);
  const documentJsonRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void loadWb4sModule();
    loadUserDisplayName().then((name) => {
      if (!cancelled) setUserName(name || '사용자');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    setContentReady(false);
    setEditorReady(false);
    setCollabReady(false);
    setLoadError(null);

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;
        const text = base64 ? base64ToUtf8(base64) : createEmptyFallback();
        documentJsonRef.current = normalizeWb4sDocument(text);
        setContentReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load wb4s');
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
    let retryTimer = null;
    let mountAttempts = 0;

    async function mountEditor() {
      if (cancelled || !mountRef.current) return;

      try {
        const wb4s = await loadWb4sModule();
        if (cancelled || !mountRef.current) return;

        mountRef.current.innerHTML = '';
        const editor = await wb4s.mount(mountRef.current, {
          fileName,
          relativePath,
          documentJson: documentJsonRef.current,
          roomId,
          syncServerUrl: getSyncServerUrl(syncInfo),
          userName,
          onLoadError: (err) => {
            if (!cancelled) setLoadError(err.message);
          },
          onCollabStatus: (collabStatus) => {
            if (cancelled) return;
            setRemotePeerCount(Math.max(0, Number(collabStatus.remotePeerCount) || 0));
            setCollabReady(Boolean(collabStatus.isReady && collabStatus.isSynced));
          },
        });

        if (cancelled) {
          editor.destroy?.();
          return;
        }

        editorRef.current = editor;
        setEditorReady(true);
        setCollabReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to mount wb4s editor');
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
        setLoadError('wb4s 마운트 영역을 준비하지 못했습니다.');
        return;
      }
      retryTimer = window.setTimeout(tryMount, 50);
    }

    tryMount();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
  }, [contentReady, fileName, relativePath, roomId, syncInfo, userName]);

  const handleSave = async () => {
    if (!workspace.ready || !editorRef.current) return;
    setSaving(true);
    try {
      const json = await editorRef.current.exportDocumentJson();
      const base64 = utf8ToBase64(normalizeWb4sDocument(json));
      await workspace.writeBinary(base64);
      await workspace.commit();
      documentJsonRef.current = json;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    editorRef.current?.destroy?.();
    await workspace.close();
    onClose();
  };

  const peerCount = useAwarenessPeerCount(provider);
  const iframePeerCount = remotePeerCount;
  const effectiveRemotePeers = Math.max(
    iframePeerCount,
    peerCount != null ? Math.max(0, peerCount - 1) : 0,
  );
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && (workspace.loading || !contentReady || !editorReady);

  return (
    <EditorModal
      title={fileName}
      subtitle={`WB4S · room ${roomId} · ${lanEndpoints}`}
      status={status}
      synced={synced && collabReady}
      peerCount={peerCount != null ? peerCount + iframePeerCount : iframePeerCount + 1}
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
          ? 'WhiteBoard4Share 로드 실패'
          : editorRef.current
            ? effectiveRemotePeers > 0
              ? `WhiteBoard4Share ${WB4S_VERSION} · LAN 협업 편집 (협업자 ${effectiveRemotePeers}명 · room ${roomId})`
              : `WhiteBoard4Share ${WB4S_VERSION} · 화이트보드 LAN 협업 · room ${roomId} · USB 저장 시 .wb4s 유지`
            : `WhiteBoard4Share ${WB4S_VERSION} · 편집기 초기화 중…`}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-nas-muted">
            <span>화이트보드 로드 및 WhiteBoard4Share 마운트 중…</span>
          </div>
        )}

        <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden" />
      </div>
    </EditorModal>
  );
}

function createEmptyFallback() {
  return JSON.stringify({
    format: 'whiteboard4share',
    version: 1,
    exportedAt: new Date().toISOString(),
    title: '제목 없음',
    paths: [],
    images: [],
    texts: [],
    tables: [],
  });
}
