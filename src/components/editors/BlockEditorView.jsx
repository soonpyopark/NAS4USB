import { useEffect, useMemo } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';
import '@blocknote/mantine/style.css';
import '../../styles/block-editor.css';
import { BLOCKNOTE_FRAGMENT } from '../../lib/blocknote/seedRoom.js';
import { BLOCKNOTE_TABLE_OPTIONS } from '../../lib/blocknote/editorConfig.js';
import {
  createBlocknoteResolveFileUrl,
  createBlocknoteUploadFile,
} from '../../lib/blocknote/uploadFile.js';

/**
 * @param {{
 *   relativePath: string,
 *   initialBlocks: import('@blocknote/core').PartialBlock[],
 *   collaboration: {
 *     doc: import('yjs').Doc,
 *     provider: import('y-websocket').WebsocketProvider,
 *     user: { name: string, color: string },
 *   } | null,
 *   readOnly?: boolean,
 *   onReady?: (editor: import('@blocknote/core').BlockNoteEditor) => void,
 *   onSave?: () => void,
 * }} props
 */
export default function BlockEditorView({
  relativePath,
  initialBlocks,
  collaboration,
  readOnly = false,
  onReady,
  onSave,
}) {
  useEffect(() => {
    document.documentElement.classList.add('block-embed-mode');
    return () => document.documentElement.classList.remove('block-embed-mode');
  }, []);

  const uploadFile = useMemo(
    () => createBlocknoteUploadFile(relativePath),
    [relativePath],
  );
  const resolveFileUrl = useMemo(
    () => createBlocknoteResolveFileUrl(relativePath),
    [relativePath],
  );

  const editor = useCreateBlockNote(
    {
      uploadFile,
      resolveFileUrl,
      tables: BLOCKNOTE_TABLE_OPTIONS,
      ...(collaboration
        ? {
            collaboration: {
              fragment: collaboration.doc.getXmlFragment(BLOCKNOTE_FRAGMENT),
              user: collaboration.user,
              provider: collaboration.provider,
              showCursorLabels: 'activity',
            },
          }
        : {
            initialContent: initialBlocks,
          }),
    },
    [
      collaboration?.doc,
      collaboration?.provider,
      collaboration?.user.name,
      collaboration?.user.color,
      initialBlocks,
      relativePath,
      uploadFile,
      resolveFileUrl,
    ],
  );

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (readOnly) return undefined;

    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave, readOnly]);

  return (
    <div className="block-editor-shell">
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme="light"
        slashMenu={!readOnly}
        sideMenu={!readOnly}
        filePanel={!readOnly}
        formattingToolbar={!readOnly}
        linkToolbar={!readOnly}
        emojiPicker={!readOnly}
        tableHandles={!readOnly}
      />
    </div>
  );
}
