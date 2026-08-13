import { useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import HistoryModal from './HistoryModal.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindRhwpEditor } from '../../sync/adapters/rhwpAdapter.js';
import { setTextDiskRevision } from '../../sync/adapters/textEditorAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { loadRhwpModule } from '../../lib/rhwp/loadRhwp.js';

const RHWP_VERSION = '0.8.4';
const MOUNT_TIMEOUT_MS = 200_000;

export default function HwpxEditorShell({
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
  const [loadingStatus, setLoadingStatus] = useState('');
  const [contentReady, setContentReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const mountRef = useRef(null);
  const unbindRef = useRef(null);
  const hwpxBase64Ref = useRef('');
  const diskRevisionRef = useRef('');

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    setContentReady(false);
    setEditorReady(false);
    setEditorHandle(null);
    setLoadError(null);
    setLoadingStatus('');

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        let nextDiskRevision = '';
        try {
          const statInfo = await window.nas4usb.fs.stat(relativePath);
          nextDiskRevision = statInfo?.modifiedAt ?? '';
        } catch {
          // diskRevision is optional; load should still succeed.
        }

        if (cancelled) return;
        hwpxBase64Ref.current = base64;
        diskRevisionRef.current = nextDiskRevision;
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
  }, [workspace.ready, workspace.sessionId, workspace.readBinary, relativePath]);

  useEffect(() => {
    if (!contentReady) return undefined;

    let cancelled = false;
    let mountAttempts = 0;
    let retryTimer = null;

    async function mountEditor() {
      if (cancelled || !mountRef.current) return;

      setLoadingStatus('rhwp-studio 초기화 중…');

      try {
        const rhwp = await loadRhwpModule();
        if (cancelled || !mountRef.current) return;
        if (!rhwp) {
          throw new Error('@rhwp/core 코어를 불러오지 못했습니다.');
        }

        mountRef.current.innerHTML = '';
        const mountPromise = rhwp.mount(mountRef.current, {
          fileName,
          relativePath,
          hwpxBase64: hwpxBase64Ref.current,
          onLoadError: (err) => {
            if (!cancelled) setLoadError(err.message);
          },
          onStudioStatus: (text) => {
            if (!cancelled && text) setLoadingStatus(text);
          },
        });

        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(
              new Error(
                'HWPX 로드 시간이 초과되었습니다. 문서가 크거나 rhwp-studio 초기화가 지연되었을 수 있습니다. 탭을 닫았다가 다시 열어 주세요.',
              ),
            );
          }, MOUNT_TIMEOUT_MS);
        });

        let editor;
        try {
          editor = await Promise.race([mountPromise, timeoutPromise]);
        } finally {
          if (timeoutId) window.clearTimeout(timeoutId);
        }
        if (cancelled) {
          editor.destroy?.();
          return;
        }

        setEditorHandle(editor);
        setEditorReady(true);
        setLoadingStatus('');
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
      diskRevision: diskRevisionRef.current,
      readOnly: shareReadOnly,
    });
    setBound(true);

    return () => {
      unbindRef.current?.();
      unbindRef.current = null;
      editorHandle.setEditable?.(false);
      setBound(false);
    };
  }, [editorReady, doc, editorHandle, provider, shareReadOnly]);

  const handleSave = async () => {
    if (shareReadOnly) return;
    if (!workspace.ready || !editorHandle) return;
    setSaving(true);
    try {
      const base64 = editorHandle.exportHwpxBase64
        ? await editorHandle.exportHwpxBase64()
        : editorHandle.getHwpxBase64?.() ?? hwpxBase64Ref.current;
      await workspace.writeBinary(base64);
      await workspace.commit();
      hwpxBase64Ref.current = base64;
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        setTextDiskRevision(doc, 'documentBase64', statInfo?.modifiedAt ?? '');
      } catch {
        // ignore optional revision update
      }
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

  // Restore already overwrote the file on disk (and archived the pre-restore state) —
  // push the restored bytes into the live rhwp handle + Y.doc snapshot, mirroring handleSave.
  const handleRestoreHistory = async (base64) => {
    await editorHandle?.setHwpxBase64?.(base64, 'restore');
    hwpxBase64Ref.current = base64;
    await workspace.writeBinary(base64);
    try {
      const statInfo = await window.nas4usb.fs.stat(relativePath);
      diskRevisionRef.current = statInfo?.modifiedAt ?? '';
      if (doc) setTextDiskRevision(doc, 'documentBase64', diskRevisionRef.current);
    } catch {
      // diskRevision is optional
    }
  };

  const peerCount = useAwarenessPeerCount(provider);
  const remotePeerCount = peerCount != null ? Math.max(0, peerCount - 1) : null;
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = !loadError && (workspace.loading || !contentReady || !editorReady);
  const waitingSync = editorReady && Boolean(editorHandle) && Boolean(doc) && !bound;

  return (
    <>
      <EditorModal
        title={fileName}
        subtitle={`HWPX · room ${roomId} · ${lanEndpoints}`}
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
            ? `rhwp ${RHWP_VERSION} · 공유(보기 전용) · 편집·저장 불가`
            : loadError
              ? 'rhwp 로드 실패'
              : editorHandle
                ? waitingSync
                  ? `rhwp ${RHWP_VERSION} · rhwp-studio · Y.js 연결 중…`
                  : remotePeerCount != null && remotePeerCount > 0
                    ? `rhwp ${RHWP_VERSION} · rhwp-studio · LAN 협업 편집 (협업자 ${remotePeerCount}명 · room ${roomId})`
                    : `rhwp ${RHWP_VERSION} · rhwp-studio · HWPX LAN 협업 편집 · room ${roomId} · 작성 내용 저장 시 HWPX 유지`
                : `rhwp ${RHWP_VERSION} · rhwp-studio 초기화 중…`}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm text-nas-muted">
              <span>{loadingStatus || 'HWPX 로드 및 rhwp-studio 마운트 중…'}</span>
              <span className="text-xs text-slate-400">
                WASM 초기화·문서 렌더링 중입니다. 큰 문서는 최대 3분까지 걸릴 수 있습니다.
              </span>
            </div>
          )}

          <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden" />
        </div>
      </EditorModal>

      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        relativePath={relativePath}
        fileName={fileName}
        extension="hwpx"
        onRestored={handleRestoreHistory}
      />
    </>
  );
}
