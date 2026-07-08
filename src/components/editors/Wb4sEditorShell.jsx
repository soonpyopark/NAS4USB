import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { getSyncServerUrl } from '../../sync/buildWsUrl.js';
import {
  base64ToUtf8,
  getWb4sFileStem,
  normalizeWb4sDocument,
  titleToWb4sFileName,
  utf8ToBase64,
  wb4sDocumentWithTitle,
} from '../../wb4s/document.js';
import { loadUserDisplayName } from '../../lib/userProfile.js';
import { formatNetworkError, retryAsync } from '../../lib/retryAsync.js';
import { isBrowserClient } from '../../lib/runtime.js';
import { getParentPath, joinRelativePath, resolveUniqueName } from '../../lib/fsPaths.js';

const Wb4sEditorView = lazy(() => import('../../wb4s/Wb4sEditorView.jsx'));

export default function Wb4sEditorShell({
  relativePath,
  fileName,
  syncInfo,
  onClose,
  onRenamed,
  allowClose = true,
  readOnly: shareReadOnly = false,
}) {
  const workspace = useWorkspaceSession(relativePath);
  const relativePathRef = useRef(relativePath);
  const fileNameRef = useRef(fileName);
  const [loadError, setLoadError] = useState(null);
  const [contentReady, setContentReady] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [userName, setUserName] = useState('사용자');
  const exportApiRef = useRef(null);
  const documentJsonRef = useRef('');
  const lastCommittedJsonRef = useRef('');
  const closingRef = useRef(false);

  relativePathRef.current = relativePath;
  fileNameRef.current = fileName;

  useEffect(() => {
    let cancelled = false;
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
    setLoadError(null);
    exportApiRef.current = null;

    async function loadContent() {
      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;
        const text = base64 ? base64ToUtf8(base64) : createEmptyFallback(fileNameRef.current);
        documentJsonRef.current = normalizeWb4sDocument(text);
        lastCommittedJsonRef.current = documentJsonRef.current;
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

  const handleEditorReady = useCallback((api) => {
    exportApiRef.current = api;
    setEditorReady(true);
  }, []);

  const saveToHost = useCallback(async (titleOverride, { includeThumbnail = false } = {}) => {
    if (shareReadOnly) return false;
    if (!workspace.ready || !exportApiRef.current) return false;

    const json = exportApiRef.current.exportDocument({ includeThumbnail });
    const normalized = titleOverride
      ? wb4sDocumentWithTitle(json, titleOverride)
      : normalizeWb4sDocument(json);

    if (!titleOverride && normalized === lastCommittedJsonRef.current) {
      return false;
    }

    const base64 = utf8ToBase64(normalized);
    await workspace.saveBinary(base64);
    documentJsonRef.current = normalized;
    lastCommittedJsonRef.current = normalized;
    return true;
  }, [shareReadOnly, workspace]);

  const handleRenameTitle = useCallback(async (nextTitle) => {
    if (shareReadOnly) return;
    try {
      const trimmedTitle = nextTitle.trim() || '제목 없음';
      const parent = getParentPath(relativePathRef.current);
      const dirEntries = await window.nas4usb.fs.readDir(parent === '.' ? '.' : parent);
      const existingNames = dirEntries
        .map((entry) => entry.name)
        .filter((name) => name !== fileNameRef.current);
      const nextFileName = resolveUniqueName(existingNames, titleToWb4sFileName(trimmedTitle));

      if (nextFileName === fileNameRef.current) {
        await saveToHost(trimmedTitle);
        return;
      }

      const nextRelativePath =
        parent === '.' ? nextFileName : joinRelativePath(parent, nextFileName);

      await saveToHost(trimmedTitle);
      const result = await workspace.rename(nextRelativePath);

      relativePathRef.current = result.relativePath;
      fileNameRef.current = result.fileName;
      onRenamed?.({ relativePath: result.relativePath, name: result.fileName });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Rename failed');
      throw err;
    }
  }, [onRenamed, saveToHost, shareReadOnly, workspace]);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;

    const retryOptions = isBrowserClient()
      ? { retries: 1, delayMs: 300 }
      : { retries: 0, delayMs: 0 };

    try {
      if (!shareReadOnly) {
        await retryAsync(() => saveToHost(undefined, { includeThumbnail: false }), retryOptions);
      }
    } catch (err) {
      closingRef.current = false;
      setLoadError(formatNetworkError(err));
      throw err;
    }

    exportApiRef.current = null;
    onClose();
    void workspace.close();
  }, [onClose, saveToHost, shareReadOnly, workspace]);

  const isLoading = !loadError && (workspace.loading || !contentReady || !editorReady);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white">
      {(workspace.error || loadError) && (
        <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-sm">
          {workspace.error || loadError}
        </div>
      )}

      {shareReadOnly && (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-nas-muted">
          공유(보기 전용) · 편집·저장 불가
        </div>
      )}

      <div className={`relative flex min-h-0 flex-1 flex-col${shareReadOnly ? ' pointer-events-none select-none' : ''}`}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white text-sm text-nas-muted">
            <span>화이트보드 편집기 준비 중…</span>
          </div>
        )}

        {contentReady && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
                WhiteBoard4Share 모듈 로드 중…
              </div>
            }
          >
            <Wb4sEditorView
              relativePath={relativePath}
              documentJson={documentJsonRef.current}
              syncServerUrl={getSyncServerUrl(syncInfo)}
              userName={userName}
              onReady={handleEditorReady}
              onRenameTitle={handleRenameTitle}
              {...(allowClose ? { onClose: handleClose } : {})}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function createEmptyFallback(fileName) {
  const stem = getWb4sFileStem(fileName) || '제목 없음';
  return JSON.stringify({
    format: 'whiteboard4share',
    version: 1,
    exportedAt: new Date().toISOString(),
    title: stem,
    paths: [],
    images: [],
    texts: [],
    tables: [],
  });
}
