import { useCallback, useEffect, useRef, useState } from 'react';
import EditorModal from './EditorModal.jsx';
import TextEditor from './TextEditor.jsx';
import { useYjsSession } from '../../hooks/useYjsSession.js';
import { useAwarenessPeerCount } from '../../hooks/useAwarenessPeerCount.js';
import { useWorkspaceSession } from '../../hooks/useWorkspaceSession.js';
import { bindRhwpEditor } from '../../sync/adapters/rhwpAdapter.js';
import { setTextDiskRevision } from '../../sync/adapters/textEditorAdapter.js';
import { getLanWsEndpoints } from '../../sync/buildWsUrl.js';
import { decodeTextBase64, encodeTextBase64 } from '../../lib/text/textIO.js';

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
  readOnly: shareReadOnly = false,
}) {
  const isMarkdown = extension === 'md';
  const workspace = useWorkspaceSession(relativePath);
  const { doc, status, synced, roomId, provider } = useYjsSession(relativePath, syncInfo, {
    syncReady: syncInfo != null,
  });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialText, setInitialText] = useState('');
  const [ready, setReady] = useState(false);
  const [editorHandle, setEditorHandle] = useState(null);
  const [bound, setBound] = useState(false);
  const unbindRef = useRef(null);
  const initialTextRef = useRef('');
  const diskRevisionRef = useRef('');
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

  const handleSave = useCallback(async () => {
    if (shareReadOnly) return;
    if (!workspace.ready || !editorHandleRef.current) return;
    setSaving(true);
    try {
      const base64 = encodeTextBase64(editorHandleRef.current.getText());
      await workspace.writeBinary(base64);
      await workspace.commit();
      try {
        const statInfo = await window.nas4usb.fs.stat(relativePath);
        setTextDiskRevision(doc, 'document', statInfo?.modifiedAt ?? '');
      } catch {
        // ignore optional revision update
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [doc, relativePath, shareReadOnly, workspace]);

  const handleClose = async () => {
    unbindRef.current?.();
    await workspace.close();
    onClose();
  };

  const peerCount = useAwarenessPeerCount(provider);
  const lanEndpoints = getLanWsEndpoints(syncInfo, roomId).join(' · ');
  const isLoading = workspace.loading || !doc || !ready;
  const waitingSync = ready && Boolean(editorHandle) && !bound;
  const fileLabel = isMarkdown ? 'Markdown' : 'Text';

  return (
    <EditorModal
      title={fileName}
      subtitle={`${fileLabel} · room ${roomId} · ${lanEndpoints}`}
      status={status}
      synced={synced}
      peerCount={peerCount}
      saving={saving}
      saveDisabled={shareReadOnly || waitingSync}
      hideSave={shareReadOnly}
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
          ? `${fileLabel} 에디터 · 공유(보기 전용) · 편집·저장 불가`
          : waitingSync
            ? `${fileLabel} 에디터 · Y.js 동기화 후 편집 가능`
            : `${fileLabel} 에디터 · 줄번호 · 찾기/바꾸기 · Ctrl+S 저장 · LAN 실시간 동시 편집`}
        {!shareReadOnly && isMarkdown ? ' · Markdown 미리보기(편집/분할/미리보기)' : ''}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
          파일 로드 및 Y.js 세션 준비 중…
        </div>
      ) : (
        <TextEditor
          initialText={initialText}
          isMarkdown={isMarkdown}
          onReady={handleEditorReady}
          onSave={handleSave}
        />
      )}
    </EditorModal>
  );
}
