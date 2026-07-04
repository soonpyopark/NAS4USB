import { useEffect, useMemo, useRef } from 'react';
import { EditorView } from '@wb4s-engine/components/EditorView.tsx';
import { EmbedDeptSessionProvider } from '@wb4s-engine/context/DeptSessionContext.tsx';
import { parseWhiteboardFileText } from '@wb4s-engine/lib/whiteboard/whiteboardFile.ts';
import '@wb4s-engine/index.css';
import '@wb4s-engine/App.css';

/**
 * EduCowork native WhiteBoard4Share editor (no iframe mount).
 *
 * @param {{
 *   documentJson: string,
 *   roomId: string,
 *   syncServerUrl: string,
 *   userName: string,
 *   onReady?: (api: { exportDocument: () => string }) => void,
 *   onCollabStatus?: (status: {
 *     remotePeerCount: number,
 *     isWsConnected: boolean,
 *     isSynced: boolean,
 *     isReady: boolean,
 *   }) => void,
 *   onSaveToHost?: () => void | Promise<void>,
 *   onRenameTitle?: (title: string) => void | Promise<void>,
 *   onClose?: () => void | Promise<void>,
 * }} props
 */
export default function Wb4sEditorView({
  documentJson,
  roomId,
  syncServerUrl,
  userName,
  onReady,
  onCollabStatus,
  onSaveToHost,
  onRenameTitle,
  onClose,
}) {
  const onReadyRef = useRef(onReady);
  const onCollabStatusRef = useRef(onCollabStatus);
  const onSaveToHostRef = useRef(onSaveToHost);
  const onRenameTitleRef = useRef(onRenameTitle);
  const onCloseRef = useRef(onClose);
  onReadyRef.current = onReady;
  onCollabStatusRef.current = onCollabStatus;
  onSaveToHostRef.current = onSaveToHost;
  onRenameTitleRef.current = onRenameTitle;
  onCloseRef.current = onClose;

  useEffect(() => {
    document.documentElement.classList.add('wb4s-embed-mode');
    return () => {
      document.documentElement.classList.remove('wb4s-embed-mode');
    };
  }, []);

  const embedMode = useMemo(
    () => ({
      initialPayload: parseWhiteboardFileText(documentJson),
      roomId,
      syncServerUrl,
      userName,
      onReady: (api) => onReadyRef.current?.(api),
      onCollabStatus: (status) => onCollabStatusRef.current?.(status),
      onSaveToHost: () => onSaveToHostRef.current?.(),
      onRenameTitle: (title) => onRenameTitleRef.current?.(title),
      onClose: () => onCloseRef.current?.(),
    }),
    [documentJson, roomId, syncServerUrl, userName],
  );

  return (
    <EmbedDeptSessionProvider userName={userName}>
      <div className="app editor min-h-0 flex-1 overflow-hidden">
        <EditorView
          whiteboardId="embed"
          byDept="embed"
          embedMode={embedMode}
          onBack={() => {}}
        />
      </div>
    </EmbedDeptSessionProvider>
  );
}
