import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import HistoryModal from './HistoryModal.jsx';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { loadUserDisplayName } from '../../lib/userProfile.js';
import { pickUserColor } from '../../lib/userColors.js';
import { getTiptapFileStem } from '../../lib/tiptap/document.js';
import { normalizeTiptapAssetUrls } from '../../lib/tiptap/assetUrls.js';
import { seedTiptapRoomFromDisk, setTiptapDiskRevision } from '../../lib/tiptap/seedRoom.js';
import { cleanupUnreferencedTiptapAssets } from '../../lib/tiptap/assetCleanup.js';
import {
  packTiptapFileFromSidecar,
  parseTiptapFileBase64,
  removeTiptapAssetsSidecar,
  syncEmbeddedAssetsToSidecar,
} from '../../lib/tiptap/package.js';

const TipTapEditorView = lazy(() => import('./TipTapEditorView.jsx'));

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
export default function TipTapEditorShell({
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
  const [initialContent, setInitialContent] = useState(
    /** @type {import('@tiptap/core').JSONContent | null} */ (null),
  );
  const [contentReady, setContentReady] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [collabUser, setCollabUser] = useState({ name: '사용자', color: '#2563eb' });
  const [showHistory, setShowHistory] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingHwpx, setExportingHwpx] = useState(false);

  const editorRef = useRef(/** @type {import('@tiptap/core').Editor | null} */ (null));
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

        const parsed = await parseTiptapFileBase64(base64);
        if (parsed.embeddedAssets.length > 0) {
          await removeTiptapAssetsSidecar(relativePath);
          await syncEmbeddedAssetsToSidecar(relativePath, parsed.embeddedAssets);
        }

        diskRevisionRef.current = nextDiskRevision;
        setInitialContent(normalizeTiptapAssetUrls(parsed.content, relativePath));
        setContentReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load TipTap document');
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
    if (!doc || !contentReady || !initialContent) return;
    if (collaborationEnabled && !synced) {
      setRoomReady(false);
      return;
    }

    if (collaborationEnabled) {
      seedTiptapRoomFromDisk(doc, initialContent, {
        diskRevision: diskRevisionRef.current,
      });
    }

    setRoomReady(true);
  }, [collaborationEnabled, contentReady, doc, initialContent, synced]);

  const handleEditorReady = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleSave = useCallback(async () => {
    if (shareReadOnly) return;
    if (!workspace.ready || !editorRef.current) return;
    setSaving(true);
    try {
      const title = getTiptapFileStem(fileName);
      const documentJson = editorRef.current.getJSON();
      await cleanupUnreferencedTiptapAssets(relativePath, documentJson);
      const base64 = await packTiptapFileFromSidecar({
        title,
        exportedAt: new Date().toISOString(),
        content: documentJson,
        tiptapRelativePath: relativePath,
      });
      await workspace.writeBinary(base64);
      await workspace.commit();
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        if (doc) {
          setTiptapDiskRevision(doc, statInfo?.modifiedAt ?? '');
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

  const handleRestoreHistory = useCallback(
    async (base64) => {
      const parsed = await parseTiptapFileBase64(base64);
      await removeTiptapAssetsSidecar(relativePath);
      if (parsed.embeddedAssets.length > 0) {
        await syncEmbeddedAssetsToSidecar(relativePath, parsed.embeddedAssets);
      }
      const normalized = normalizeTiptapAssetUrls(parsed.content, relativePath);

      let nextDiskRevision = '';
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        nextDiskRevision = statInfo?.modifiedAt ?? '';
      } catch {
        // optional
      }

      if (collaborationEnabled && doc) {
        seedTiptapRoomFromDisk(doc, normalized, {
          diskRevision: nextDiskRevision,
          force: true,
        });
      } else if (editorRef.current) {
        editorRef.current.commands.setContent(normalized);
      }

      diskRevisionRef.current = nextDiskRevision;
      await workspace.writeBinary(base64);
    },
    [collaborationEnabled, doc, relativePath, workspace],
  );

  const handleExportHtml = useCallback(async () => {
    if (exportingHtml || exportingHwpx || !editorRef.current) return;
    setExportingHtml(true);
    setLoadError(null);
    try {
      const { exportLiveTiptapContentAsHtml } = await import('../../lib/tiptap/exportHtml.jsx');
      const saved = await exportLiveTiptapContentAsHtml(
        relativePath,
        fileName,
        editorRef.current,
      );
      if (!saved) return;
      const { showAppAlert } = await import('../../lib/nativeDialog.js');
      await showAppAlert({
        title: 'HTML로 내보내기',
        body: `내보냈습니다.\n${saved.absolutePath ?? saved.fileName}`,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'HTML로 내보내기에 실패했습니다.');
    } finally {
      setExportingHtml(false);
    }
  }, [exportingHtml, exportingHwpx, fileName, relativePath]);

  const handleExportHwpx = useCallback(async () => {
    if (exportingHtml || exportingHwpx || !editorRef.current) return;
    setExportingHwpx(true);
    setLoadError(null);
    try {
      const { exportLiveTiptapContentAsHwpx } = await import('../../lib/tiptap/exportHwpx.js');
      const saved = await exportLiveTiptapContentAsHwpx(
        relativePath,
        fileName,
        editorRef.current,
      );
      if (!saved) return;
      const { showAppAlert } = await import('../../lib/nativeDialog.js');
      await showAppAlert({
        title: 'HWPX로 내보내기',
        body: `내보냈습니다.\n${saved.absolutePath ?? saved.fileName}`,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'HWPX로 내보내기에 실패했습니다.');
    } finally {
      setExportingHwpx(false);
    }
  }, [exportingHtml, exportingHwpx, fileName, relativePath]);

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
  const isLoading = workspace.loading || !doc || !contentReady || initialContent == null;
  const waitingSync = collaborationEnabled && contentReady && !roomReady;
  const syncReadOnly = collaborationEnabled && (!synced || waitingSync);
  const readOnly = shareReadOnly || syncReadOnly;
  const displayStatus = collaborationEnabled ? status : 'connected';
  const displaySynced = collaborationEnabled ? synced && roomReady : true;

  return (
    <>
      <EditorModal
        title={fileName}
        subtitle={`TipTap · ${relativePath} · room ${roomId} · ${lanEndpoints}`}
        status={displayStatus}
        synced={displaySynced}
        peerCount={peerCount}
        saving={saving}
        saveDisabled={readOnly}
        hideSave={shareReadOnly}
        hideHistory={shareReadOnly}
        onShowHistory={() => setShowHistory(true)}
        onExportHtml={isLoading || shareReadOnly ? undefined : handleExportHtml}
        exportingHtml={exportingHtml}
        onExportHwpx={isLoading || shareReadOnly ? undefined : handleExportHwpx}
        exportingHwpx={exportingHwpx}
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
            ? 'TipTap · 공유(보기 전용) · 편집·저장 불가'
            : waitingSync
              ? status === 'connecting'
                ? 'TipTap · 재연결 중… Y.js 동기화 후 편집 가능'
                : 'TipTap · Y.js 동기화 후 편집 가능 · LAN 실시간 협업'
              : collaborationEnabled
                ? "TipTap · 전체 서식 툴바 · '/' 블록 · 표/이미지 · 원격 커서 · Ctrl+S 저장"
                : "TipTap · 전체 서식 툴바 · '/' 블록 · 표/이미지 · Ctrl+S 저장"}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-nas-muted">
              파일 로드 및 Y.js 세션 준비 중…
            </div>
          )}

          {contentReady && initialContent && roomReady && (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
                  TipTap 모듈 로드 중…
                </div>
              }
            >
              <TipTapEditorView
                relativePath={relativePath}
                initialContent={initialContent}
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
        extension="tiptap"
        onRestored={handleRestoreHistory}
      />
    </>
  );
}
