import { useEffect, useMemo, useRef } from 'react';
import { EditorView } from '@wb4s-engine/components/EditorView.tsx';
import { EmbedDeptSessionProvider } from '@wb4s-engine/context/DeptSessionContext.tsx';
import { parseWhiteboardFileText } from '@wb4s-engine/lib/whiteboard/whiteboardFile.ts';
import '@wb4s-engine/index.css';
import '@wb4s-engine/App.css';
import {
  getWb4sByDept,
  getWb4sCollabRoomId,
  getWb4sWhiteboardId,
} from './document.js';

/**
 * NAS4USB native WhiteBoard4Share editor (upstream v1.0.3 collab).
 *
 * @param {{
 *   relativePath: string,
 *   documentJson: string,
 *   syncServerUrl: string,
 *   userName: string,
 *   onReady?: (api: { exportDocument: () => string }) => void,
 *   onCollabStatus?: (status: {
 *     remotePeerCount: number,
 *     isWsConnected: boolean,
 *     isSynced: boolean,
 *     isReady: boolean,
 *   }) => void,
 *   onRenameTitle?: (title: string) => void | Promise<void>,
 *   onClose?: () => void | Promise<void>,
 * }} props
 */
export default function Wb4sEditorView({
  relativePath,
  documentJson,
  syncServerUrl,
  userName,
  onReady,
  onCollabStatus,
  onRenameTitle,
  onClose,
}) {
  const onReadyRef = useRef(onReady);
  const onCollabStatusRef = useRef(onCollabStatus);
  const onRenameTitleRef = useRef(onRenameTitle);
  const onCloseRef = useRef(onClose);
  onReadyRef.current = onReady;
  onCollabStatusRef.current = onCollabStatus;
  onRenameTitleRef.current = onRenameTitle;
  onCloseRef.current = onClose;

  useEffect(() => {
    document.documentElement.classList.add('wb4s-embed-mode');
    return () => {
      document.documentElement.classList.remove('wb4s-embed-mode');
    };
  }, []);

  const whiteboardId = useMemo(() => getWb4sWhiteboardId(relativePath), [relativePath]);
  const byDept = useMemo(() => getWb4sByDept(relativePath), [relativePath]);
  const roomId = useMemo(() => getWb4sCollabRoomId(relativePath), [relativePath]);

  const embedMode = useMemo(
    () => ({
      initialPayload: parseWhiteboardFileText(documentJson),
      roomId,
      syncServerUrl,
      userName,
      onReady: (api) => onReadyRef.current?.(api),
      onCollabStatus: (status) => onCollabStatusRef.current?.(status),
      onRenameTitle: (title) => Promise.resolve(onRenameTitleRef.current?.(title)),
      onClose: () => Promise.resolve(onCloseRef.current?.()),
    }),
    [documentJson, roomId, syncServerUrl, userName],
  );

  return (
    <EmbedDeptSessionProvider userName={userName}>
      <div className="app editor min-h-0 flex-1 overflow-hidden">
        <EditorView
          whiteboardId={whiteboardId}
          byDept={byDept}
          embedMode={embedMode}
          onBack={() => {}}
        />
      </div>
    </EmbedDeptSessionProvider>
  );
}
