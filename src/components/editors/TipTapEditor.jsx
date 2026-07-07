import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { insertFullWidthTable, nestedTableExtensions, StyledParagraph } from '../../lib/tiptap/styledBlockExtensions.js';
import { formatHtmlFragment } from '../../lib/tiptap/formatHtmlFragment.js';
import HtmlSourceEditor from './HtmlSourceEditor.jsx';

/**
 * @param {object} props
 * @param {string} props.initialHtml
 * @param {(handle: import('../../lib/tiptap/types.js').TipTapEditorHandle) => void} props.onReady
 */
export default function TipTapEditor({ initialHtml, onReady }) {
  const mountRef = useRef(null);
  const listenersRef = useRef(new Set());
  const htmlRef = useRef(initialHtml);
  const applyingRemoteRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const [viewMode, setViewMode] = useState('visual');
  const [sourceText, setSourceText] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const viewModeRef = useRef('visual');
  viewModeRef.current = viewMode;
  onReadyRef.current = onReady;

  const notifyChange = useCallback((origin = 'local') => {
    listenersRef.current.forEach((listener) => listener(htmlRef.current, origin));
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        paragraph: false,
      }),
      StyledParagraph,
      Placeholder.configure({ placeholder: '내용을 입력하세요…' }),
      ...nestedTableExtensions,
    ],
    content: initialHtml || '<p></p>',
    editable: false,
    onUpdate: ({ editor: ed }) => {
      if (applyingRemoteRef.current) return;
      htmlRef.current = ed.getHTML();
      notifyChange('local');
    },
  });

  useEffect(() => {
    if (!editor) return undefined;

    /** @type {import('../../lib/tiptap/types.js').TipTapEditorHandle} */
    const handle = {
      getHtml: () => htmlRef.current,
      setHtml: (html, origin) => {
        const next = html || '<p></p>';
        if (next === htmlRef.current) return;
        applyingRemoteRef.current = origin === 'yjs';
        if (viewModeRef.current === 'source') {
          setSourceText(next);
        } else {
          editor.commands.setContent(next, { emitUpdate: false });
        }
        htmlRef.current = next;
        applyingRemoteRef.current = false;
      },
      onChange: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      setEditable: (enabled) => {
        editor.setEditable(enabled);
        setIsEditable(enabled);
      },
      getEditableElement: () => mountRef.current,
      destroy: () => {
        listenersRef.current.clear();
        editor.destroy();
      },
    };

    htmlRef.current = editor.getHTML();
    onReadyRef.current(handle);

    return () => {
      listenersRef.current.clear();
    };
  }, [editor]);

  if (!editor) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
        TipTap 에디터 초기화 중…
      </div>
    );
  }

  const runTable = (command) => {
    editor.chain().focus()[command]().run();
  };

  const toggleSourceView = () => {
    if (viewMode === 'visual') {
      const html = editor.getHTML();
      htmlRef.current = html;
      setSourceText(formatHtmlFragment(html));
      setViewMode('source');
      return;
    }

    editor.commands.setContent(sourceText || '<p></p>', { emitUpdate: false });
    htmlRef.current = editor.getHTML();
    notifyChange('local');
    setViewMode('visual');
  };

  const handleSourceChange = (next) => {
    setSourceText(next);
    htmlRef.current = next;
    notifyChange('local');
  };

  const toolbarDisabled = viewMode === 'source' || !isEditable;

  return (
    <div ref={mountRef} className="tiptap-shell flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          className="tiptap-toolbar-btn"
          disabled={toolbarDisabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="굵게"
        >
          B
        </button>
        <button
          type="button"
          className="tiptap-toolbar-btn"
          disabled={toolbarDisabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="기울임"
        >
          I
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          className="tiptap-toolbar-btn"
          disabled={toolbarDisabled}
          onClick={() => insertFullWidthTable(editor, { rows: 3, cols: 3, withHeaderRow: true })}
          title="표 삽입 (셀 안에서 실행 시 중첩 표)"
        >
          표
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('addRowBefore')} title="위에 줄">
          +행↑
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('addRowAfter')} title="아래에 줄">
          +행↓
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('deleteRow')} title="줄 삭제">
          −행
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('addColumnBefore')} title="왼쪽 칸">
          +열←
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('addColumnAfter')} title="오른쪽 칸">
          +열→
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('deleteColumn')} title="열 삭제">
          −열
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('mergeCells')} title="셀 병합">
          병합
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('splitCell')} title="셀 나누기">
          나누기
        </button>
        <button type="button" className="tiptap-toolbar-btn" disabled={toolbarDisabled} onClick={() => runTable('deleteTable')} title="표 삭제">
          표 삭제
        </button>
        <button
          type="button"
          className={`tiptap-toolbar-btn ml-auto ${viewMode === 'source' ? 'tiptap-toolbar-btn-active' : ''}`}
          onClick={toggleSourceView}
          title={viewMode === 'source' ? 'TIPTAP 편집기로 돌아가기' : 'HTML 편집기로 전환'}
        >
          {viewMode === 'source' ? 'TIPTAP 편집기' : 'HTML 편집기'}
        </button>
      </div>
      {viewMode === 'source' ? (
        <div className="tiptap-editor-area flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f172a] p-3">
          <HtmlSourceEditor value={sourceText} onChange={handleSourceChange} readOnly={!isEditable} />
        </div>
      ) : (
        <div className="tiptap-editor-area min-h-0 flex-1 overflow-auto bg-white px-4 py-3">
          <EditorContent editor={editor} className="tiptap-editor-content" />
        </div>
      )}
    </div>
  );
}
