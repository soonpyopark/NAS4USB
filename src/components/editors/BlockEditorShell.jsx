import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { decodeTextBase64, encodeTextBase64 } from '../../lib/text/textIO.js';
import { loadUserDisplayName } from '../../lib/userProfile.js';
import { pickUserColor } from '../../lib/userColors.js';
import {
  getBlockFileStem,
  normalizeBlockDocument,
  parseBlockDocument,
  serializeBlockDocument,
} from '../../lib/blocknote/document.js';
import { seedBlocknoteRoomFromDisk, setBlocknoteDiskRevision } from '../../lib/blocknote/seedRoom.js';

const BlockEditorView = lazy(() => import('./BlockEditorView.jsx'));

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   syncInfo: object | null,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 * }} props
 */
export default function BlockEditorShell({
  relativePath,
  fileName,
  syncInfo,
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const workspace = useWorkspaceSession(relativePath);
  const collaborationEnabled = syncInfo != null;
  const { doc, provider, status, synced, roomId } = useYjsSession(relativePath, syncInfo, {
    syncReady: true,
  });

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialBlocks, setInitialBlocks] = useState(/** @type {import('@blocknote/core').PartialBlock[] | null} */ (null));
  const [contentReady, setContentReady] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [collabUser, setCollabUser] = useState({ name: '사용자', color: '#2563eb' });

  const editorRef = useRef(/** @type {import('@blocknote/core').BlockNoteEditor | null} */ (null));
  const diskRevisionRef = useRef('');
  const closingRef = useRef(false);

  useEffect(() => {
    if (!workspace.ready || !doc) return undefined;

    let cancelled = false;
    setContentReady(false);
    setRoomReady(false);
    editorRef.current = null;

    async function bootstrap() {
      try {
        const base64 = await workspace.readBinary();
        let nextDiskRevision = '';
        try {
          const statInfo = await window.educowork.fs.stat(relativePath);
          nextDiskRevision = statInfo?.modifiedAt ?? '';
        } catch {
          // optional
        }

        if (cancelled) return;

        const text = normalizeBlockDocument(decodeTextBase64(base64));
        const parsed = parseBlockDocument(text);
        diskRevisionRef.current = nextDiskRevision;
        setInitialBlocks(parsed.content);
        setContentReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load block document');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [doc, relativePath, workspace.ready, workspace.sessionId]);

  useEffect(() => {
    let active = true;
    loadUserDisplayName().then((name) => {
      if (!active) return;
      const displayName = name || '사용자';
      setCollabUser({
        name: displayName,
        color: pickUserColor(displayName),
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!doc || !contentReady || !initialBlocks) return;
    if (collaborationEnabled && !synced) {
      setRoomReady(false);
      return;
    }

    if (collaborationEnabled) {
      seedBlocknoteRoomFromDisk(doc, initialBlocks, {
        diskRevision: diskRevisionRef.current,
      });
    }

    setRoomReady(true);
  }, [collaborationEnabled, contentReady, doc, initialBlocks, synced]);

  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleSave = useCallback(async () => {
    if (!workspace.ready || !editorRef.current) return;
    setSaving(true);
    try {
      const title = getBlockFileStem(fileName);
      const json = serializeBlockDocument(
        editorRef.current.document,
        title,
        new Date().toISOString(),
      );
      const base64 = encodeTextBase64(json);
      await workspace.writeBinary(base64);
      await workspace.commit();
      try {
        const statInfo = await window.educowork.fs.stat(relativePath);
        if (doc) {
          setBlocknoteDiskRevision(doc, statInfo?.modifiedAt ?? '');
        }
      } catch {
        // optional
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [doc, fileName, relativePath, workspace]);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;

    try {
      editorRef.current = null;
      await workspace.close();
      onClose();
    } finally {
      closingRef.current = false;
    }
  }, [onClose, workspace]);

  const peerCount = useAwarenessPeerCount(provider);
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = workspace.loading || !doc || !contentReady || initialBlocks == null;
  const waitingSync = collaborationEnabled && contentReady && !roomReady;
  const readOnly = collaborationEnabled && (!synced || waitingSync);
  const displayStatus = collaborationEnabled ? status : 'connected';
  const displaySynced = collaborationEnabled ? synced && roomReady : true;

  return (
    <EditorModal
      title={fileName}
      subtitle={`BlockNote · ${relativePath} · room ${roomId} · ${lanEndpoints}`}
      status={displayStatus}
      synced={displaySynced}
      peerCount={peerCount}
      saving={saving}
      saveDisabled={readOnly}
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
          ? status === 'connecting'
            ? 'BlockNote · 재연결 중… Y.js 동기화 후 편집 가능'
            : 'BlockNote · Y.js 동기화 후 편집 가능 · LAN 실시간 협업'
          : collaborationEnabled
            ? 'BlockNote · 블록 편집 · 원격 커서 · Ctrl+S 저장'
            : 'BlockNote · 오프라인 편집 · Ctrl+S 저장'}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-nas-muted">
            파일 로드 및 Y.js 세션 준비 중…
          </div>
        )}

        {contentReady && initialBlocks && roomReady && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
                BlockNote 모듈 로드 중…
              </div>
            }
          >
            <BlockEditorView
              initialBlocks={initialBlocks}
              collaboration={
                collaborationEnabled && doc && provider
                  ? { doc, provider, user: collabUser }
                  : null
              }
              readOnly={readOnly}
              onReady={handleEditorReady}
              onSave={handleSave}
            />
          </Suspense>
        )}
      </div>
    </EditorModal>
  );
}
