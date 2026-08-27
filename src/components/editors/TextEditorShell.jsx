import { useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import HistoryModal from './HistoryModal.jsx';
import TextEditor from './TextEditor.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindRhwpEditor } from '../../sync/adapters/rhwpAdapter.js';
import { setTextDiskRevision } from '../../sync/adapters/textEditorAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { decodeTextBase64, encodeTextBase64 } from '../../lib/text/textIO.js';
import { persistAndCloseEditor } from '../../lib/persistOnEditorClose.js';

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   syncInfo: object,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 *   shareMode?: 'view' | 'edit' | null,
 *   readOnly?: boolean,
 *   highlightQuery?: string,
 * }} props
 */
export default function TextEditorShell({
  relativePath,
  fileName,
  extension,
  syncInfo,
  onClose,
  allowClose = true,
  fullscreen = false,
  raised = false,
  readOnly: shareReadOnly = false,
  highlightQuery = '',
}) {
  const isMarkdown = extension === 'md';
  const isHtml = extension === 'html' || extension === 'htm';
  const isSql = extension === 'sql';
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: true,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialText, setInitialText] = useState('');
  const [ready, setReady] = useState(false);
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const unbindRef = useRef(null);
  const initialTextRef = useRef('');
  const diskRevisionRef = useRef('');
  const editorHandleRef = useRef(null);
  const closingRef = useRef(false);

  useEffect(() => {
    editorHandleRef.current = editorHandle;
  }, [editorHandle]);

  useEffect(() => {
    if (!workspace.ready || !doc) return undefined;

    let cancelled = false;

    async function bootstrap() {
      try {
        const base64 = await workspace.readBinary();
        let nextDiskRevision = '';
        try {
          const statInfo = await window.nas4usb.fs.stat(relativePath);
          nextDiskRevision = statInfo?.modifiedAt ?? '';
        } catch {
          // diskRevision is optional; load should still succeed.
        }

        const text = decodeTextBase64(base64);
        if (cancelled) return;

        initialTextRef.current = text;
        diskRevisionRef.current = nextDiskRevision;
        setInitialText(text);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load text file');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      unbindRef.current?.();
      unbindRef.current = null;
    };
  }, [workspace.ready, workspace.sessionId, doc, relativePath]);

  useEffect(() => {
    if (!ready || !doc || !editorHandle || !synced) return undefined;

    setBound(false);
    unbindRef.current?.();
    unbindRef.current = bindRhwpEditor(doc, editorHandle, {
      fieldName: 'document',
      initialText: initialTextRef.current,
      synced: true,
      provider,
      diskRevision: diskRevisionRef.current,
      readOnly: shareReadOnly,
      onSynced: () => setBound(true),
    });

    return () => {
      unbindRef.current?.();
      unbindRef.current = null;
      editorHandle.setEditable?.(false);
      setBound(false);
    };
  }, [ready, doc, editorHandle, provider, synced, shareReadOnly]);

  const handleEditorReady = useCallback((editor) => {
    setEditorHandle(editor);
  }, []);

  const persistLive = useCallback(
    async ({ archive = true } = {}) => {
      if (shareReadOnly) return false;
      if (!workspace.ready || !editorHandleRef.current) return false;
      setSaving(true);
      try {
        const base64 = encodeTextBase64(editorHandleRef.current.getText());
        await workspace.writeBinary(base64);
        if (archive) {
          await workspace.commit();
          try {
            const statInfo = await window.nas4usb.fs.stat(relativePath);
            setTextDiskRevision(doc, 'document', statInfo?.modifiedAt ?? '');
          } catch {
            // ignore optional revision update
          }
        }
        return true;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '편집 내용을 저장하지 못했습니다.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [doc, relativePath, shareReadOnly, workspace],
  );

  const handleSave = useCallback(async () => {
    try {
      await persistLive({ archive: true });
    } catch {
      // error already shown
    }
  }, [persistLive]);

  const handleExportHtml = useCallback(async () => {
    if (!isMarkdown || exportingHtml || exportingPdf || printing || shareReadOnly) return;
    if (!editorHandleRef.current) return;
    setExportingHtml(true);
    setLoadError(null);
    try {
      const { exportMarkdownTextAsHtml } = await import('../../lib/text/exportMarkdown.js');
      const saved = await exportMarkdownTextAsHtml(fileName, editorHandleRef.current.getText());
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
  }, [exportingHtml, exportingPdf, fileName, isMarkdown, printing, shareReadOnly]);

  const handleExportPdf = useCallback(async () => {
    if (!isMarkdown || exportingHtml || exportingPdf || printing || shareReadOnly) return;
    if (!editorHandleRef.current) return;
    setExportingPdf(true);
    setLoadError(null);
    try {
      const { exportMarkdownTextAsPdf } = await import('../../lib/text/exportMarkdown.js');
      const saved = await exportMarkdownTextAsPdf(fileName, editorHandleRef.current.getText());
      if (!saved) return;
      const { showAppAlert } = await import('../../lib/nativeDialog.js');
      await showAppAlert({
        title: 'PDF로 내보내기',
        body: `내보냈습니다.\n${saved.absolutePath ?? saved.fileName}`,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'PDF로 내보내기에 실패했습니다.');
    } finally {
      setExportingPdf(false);
    }
  }, [exportingHtml, exportingPdf, fileName, isMarkdown, printing, shareReadOnly]);

  const handlePrint = useCallback(async () => {
    if (exportingHtml || exportingPdf || printing) return;
    if (!editorHandleRef.current) return;
    setPrinting(true);
    setLoadError(null);
    try {
      const text = editorHandleRef.current.getText();
      if (isMarkdown) {
        const { printMarkdownText } = await import('../../lib/text/exportMarkdown.js');
        await printMarkdownText(fileName, text);
        return;
      }
      if (isHtml) {
        const { printHtmlSource } = await import('../../lib/text/printTextDocument.js');
        await printHtmlSource(fileName, text, relativePath);
        return;
      }
      const { printPlainText } = await import('../../lib/text/printTextDocument.js');
      await printPlainText(fileName, text, isSql ? 'sql' : 'txt');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '인쇄에 실패했습니다.');
    } finally {
      setPrinting(false);
    }
  }, [exportingHtml, exportingPdf, fileName, isHtml, isMarkdown, isSql, printing, relativePath]);

  const handleClose = async () => {
    const canFlush = Boolean(!shareReadOnly && editorHandleRef.current && ready);
    await persistAndCloseEditor({
      closingRef,
      persist: canFlush ? () => persistLive({ archive: false }) : undefined,
      cleanup: () => {
        unbindRef.current?.();
        unbindRef.current = null;
      },
      closeWorkspace: () => workspace.close(),
      onClose,
    });
  };

  // Restore already overwrote the file on disk (and archived the pre-restore state) —
  // push the restored text into the live handle + Y.doc snapshot, mirroring handleSave.
  const handleRestoreHistory = useCallback(
    async (base64) => {
      const text = decodeTextBase64(base64);
      editorHandleRef.current?.setText?.(text, 'restore');
      initialTextRef.current = text;
      await workspace.writeBinary(base64);
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        diskRevisionRef.current = statInfo?.modifiedAt ?? '';
        if (doc) setTextDiskRevision(doc, 'document', diskRevisionRef.current);
      } catch {
        // diskRevision is optional
      }
    },
    [doc, relativePath, workspace],
  );

  const peerCount = useAwarenessPeerCount(provider);
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = workspace.loading || !doc || !ready;
  const waitingSync = ready && Boolean(editorHandle) && !bound;
  const fileLabel = isMarkdown ? 'Markdown' : isHtml ? 'HTML' : isSql ? 'SQL' : 'Text';

  return (
    <>
      <EditorModal
        title={fileName}
        subtitle={`${fileLabel} · room ${roomId} · ${lanEndpoints}`}
        status={status}
        synced={synced}
        peerCount={peerCount}
        saving={saving}
        saveDisabled={shareReadOnly || waitingSync}
        hideSave={shareReadOnly}
        hideHistory={shareReadOnly}
        onShowHistory={() => setShowHistory(true)}
        onExportHtml={
          isMarkdown && !isLoading && !shareReadOnly ? handleExportHtml : undefined
        }
        exportingHtml={exportingHtml}
        onExportPdf={
          isMarkdown && !isLoading && !shareReadOnly ? handleExportPdf : undefined
        }
        exportingPdf={exportingPdf}
        onPrint={isLoading ? undefined : handlePrint}
        printing={printing}
        onSave={handleSave}
        onClose={handleClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
        raised={raised}
      >
        {(workspace.error || loadError) && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {workspace.error || loadError}
          </div>
        )}

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-nas-muted">
          {shareReadOnly
            ? `${fileLabel} · CodeMirror(전체기능) · 공유(보기 전용) · 편집·저장 불가`
            : waitingSync
              ? `${fileLabel} · CodeMirror(전체기능) · Y.js 동기화 후 편집 가능`
              : `${fileLabel} · CodeMirror · 접기·검색·자동완성·린트·다중선택 · Ctrl+S 저장 · LAN 동시편집`}
          {!shareReadOnly && isMarkdown
            ? ' · MD 코드블록 하이라이트 · 미리보기(편집/분할/미리보기)'
            : !shareReadOnly && isHtml
              ? ' · HTML 하이라이트 · 미리보기(편집/분할/미리보기) · 스크립트는 실행하지 않음'
              : !shareReadOnly && isSql
                ? ' · SQL 하이라이트'
                : !shareReadOnly
                  ? ' · 확장자별 코드 하이라이트'
                  : ''}
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
            파일 로드 및 Y.js 세션 준비 중…
          </div>
        ) : (
          <TextEditor
            initialText={initialText}
            fileName={fileName}
            relativePath={relativePath}
            isMarkdown={isMarkdown}
            isHtml={isHtml}
            highlightQuery={highlightQuery}
            onReady={handleEditorReady}
            onSave={handleSave}
          />
        )}
      </EditorModal>

      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        relativePath={relativePath}
        fileName={fileName}
        extension={extension}
        onRestored={handleRestoreHistory}
      />
    </>
  );
}
