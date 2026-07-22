import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import HistoryModal from './HistoryModal.jsx';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { loadUserDisplayName } from '../../lib/userProfile.js';
import { pickUserColor } from '../../lib/userColors.js';
import { getBlockFileStem } from '../../lib/blocknote/document.js';
import { normalizeBlockAssetUrls } from '../../lib/blocknote/assetUrls.js';
import { seedBlocknoteRoomFromDisk, setBlocknoteDiskRevision } from '../../lib/blocknote/seedRoom.js';
import { cleanupUnreferencedBlockAssets } from '../../lib/blocknote/assetCleanup.js';
import {
  packBlockFileFromSidecar,
  parseBlockFileBase64,
  removeBlockAssetsSidecar,
  syncEmbeddedAssetsToSidecar,
} from '../../lib/blocknote/package.js';

const BlockEditorView = lazy(() => import('./BlockEditorView.jsx'));

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   syncInfo: object | null,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 *   shareMode?: 'view' | 'edit' | null,
 *   readOnly?: boolean,
 * }} props
 */
export default function BlockEditorShell({
  relativePath,
  fileName,
  syncInfo,
  onClose,
  allowClose = true,
  fullscreen = false,
  readOnly: shareReadOnly = false,
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
  const [showHistory, setShowHistory] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);

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
          const statInfo = await window.nas4usb.fs.stat(relativePath);
          nextDiskRevision = statInfo?.modifiedAt ?? '';
        } catch {
          // optional
        }

        if (cancelled) return;

        const parsed = await parseBlockFileBase64(base64);
        if (parsed.embeddedAssets.length > 0) {
          await removeBlockAssetsSidecar(relativePath);
          await syncEmbeddedAssetsToSidecar(relativePath, parsed.embeddedAssets);
        }

        diskRevisionRef.current = nextDiskRevision;
        setInitialBlocks(normalizeBlockAssetUrls(parsed.content, relativePath));
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
    if (shareReadOnly) return;
    if (!workspace.ready || !editorRef.current) return;
    setSaving(true);
    try {
      const title = getBlockFileStem(fileName);
      const documentBlocks = editorRef.current.document;
      await cleanupUnreferencedBlockAssets(relativePath, documentBlocks);
      const base64 = await packBlockFileFromSidecar({
        title,
        exportedAt: new Date().toISOString(),
        content: documentBlocks,
        blockRelativePath: relativePath,
      });
      await workspace.writeBinary(base64);
      await workspace.commit();
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
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
  }, [doc, fileName, relativePath, shareReadOnly, workspace]);

  // Restore already overwrote the file on disk (and archived the pre-restore state) and
  // purged the live Y.js room (see fileHistoryService.restoreFileHistoryEntry). That purge
  // forcibly closes our WebSocket, which makes the `roomReady` effect above briefly unmount
  // <BlockEditorView> while it reconnects — so editorRef.current can be stale/torn-down by
  // the time this resolves. Writing straight into the shared Yjs XmlFragment (rather than
  // calling replaceBlocks on a possibly-dead editor instance) is safe regardless of mount
  // state: any editor that is or later becomes bound to this doc reflects it automatically.
  // Offline (no collaboration) sessions have no Yjs binding to piggyback on, so those still
  // go through the live editor instance directly.
  const handleRestoreHistory = useCallback(
    async (base64) => {
      const parsed = await parseBlockFileBase64(base64);
      await removeBlockAssetsSidecar(relativePath);
      if (parsed.embeddedAssets.length > 0) {
        await syncEmbeddedAssetsToSidecar(relativePath, parsed.embeddedAssets);
      }
      const normalizedBlocks = normalizeBlockAssetUrls(parsed.content, relativePath);

      let nextDiskRevision = '';
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        nextDiskRevision = statInfo?.modifiedAt ?? '';
      } catch {
        // diskRevision is optional
      }

      if (collaborationEnabled && doc) {
        seedBlocknoteRoomFromDisk(doc, normalizedBlocks, {
          diskRevision: nextDiskRevision,
          force: true,
        });
      } else if (editorRef.current) {
        editorRef.current.replaceBlocks(editorRef.current.document, normalizedBlocks);
      }

      diskRevisionRef.current = nextDiskRevision;
      await workspace.writeBinary(base64);
    },
    [collaborationEnabled, doc, relativePath, workspace],
  );

  const handleExportHtml = useCallback(async () => {
    if (exportingHtml || !editorRef.current) return;
    setExportingHtml(true);
    try {
      const { exportLiveBlockContentAsHtml } = await import('../../lib/blocknote/exportHtml.jsx');
      await exportLiveBlockContentAsHtml(relativePath, fileName, editorRef.current.document);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '브라우저용으로 내보내기에 실패했습니다.');
    } finally {
      setExportingHtml(false);
    }
  }, [exportingHtml, fileName, relativePath]);

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
  const syncReadOnly = collaborationEnabled && (!synced || waitingSync);
  const readOnly = shareReadOnly || syncReadOnly;
  const displayStatus = collaborationEnabled ? status : 'connected';
  const displaySynced = collaborationEnabled ? synced && roomReady : true;

  return (
    <>
      <EditorModal
        title={fileName}
        subtitle={`BlockNote · ${relativePath} · room ${roomId} · ${lanEndpoints}`}
        status={displayStatus}
        synced={displaySynced}
        peerCount={peerCount}
        saving={saving}
        saveDisabled={readOnly}
        hideSave={shareReadOnly}
        hideHistory={shareReadOnly}
        onShowHistory={() => setShowHistory(true)}
        onExportHtml={isLoading ? undefined : handleExportHtml}
        exportingHtml={exportingHtml}
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
            ? 'BlockNote · 공유(보기 전용) · 편집·저장 불가'
            : waitingSync
              ? status === 'connecting'
                ? 'BlockNote · 재연결 중… Y.js 동기화 후 편집 가능'
                : 'BlockNote · Y.js 동기화 후 편집 가능 · LAN 실시간 협업'
              : collaborationEnabled
                ? 'BlockNote · 블록 편집 · 미디어·첨부 업로드 · 원격 커서 · Ctrl+S 저장'
                : 'BlockNote · 오프라인 편집 · 미디어·첨부 업로드 · Ctrl+S 저장'}
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
                relativePath={relativePath}
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

      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        relativePath={relativePath}
        fileName={fileName}
        extension="block"
        onRestored={handleRestoreHistory}
      />
    </>
  );
}
