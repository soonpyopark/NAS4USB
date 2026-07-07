import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLineColumn } from '../../lib/text/textIO.js';
import { renderMarkdown } from '../../lib/text/markdown.js';

/**
 * @typedef {'edit' | 'split' | 'preview'} TextEditorViewMode
 */

/**
 * @param {object} props
 * @param {string} props.initialText
 * @param {boolean} [props.isMarkdown]
 * @param {(editor: import('../../lib/rhwp/types.js').RhwpEditorHandle) => void} props.onReady
 * @param {() => void} [props.onSave]
 */
export default function TextEditor({ initialText, isMarkdown = false, onReady, onSave }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const listenersRef = useRef(new Set());
  const textRef = useRef(initialText);
  const editableRef = useRef(false);
  const [isEditable, setIsEditable] = useState(false);

  const [text, setText] = useState(initialText);
  const [wordWrap, setWordWrap] = useState(true);
  const [tabSize, setTabSize] = useState(2);
  const [viewMode, setViewMode] = useState(/** @type {TextEditorViewMode} */ ('edit'));
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, text.split('\n').length);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [text]);

  const previewHtml = useMemo(
    () => (isMarkdown ? renderMarkdown(text) : ''),
    [isMarkdown, text],
  );

  const notify = useCallback((origin = 'local') => {
    listenersRef.current.forEach((listener) => listener(textRef.current, origin));
  }, []);

  const updateText = useCallback(
    (nextText, origin = 'local') => {
      textRef.current = nextText;
      setText(nextText);
      if (textareaRef.current && textareaRef.current.value !== nextText) {
        textareaRef.current.value = nextText;
      }
      if (origin !== 'yjs') {
        notify(origin);
      }
    },
    [notify],
  );

  useEffect(() => {
    textRef.current = initialText;
    setText(initialText);
    if (textareaRef.current) {
      textareaRef.current.value = initialText;
    }
  }, [initialText]);

  useEffect(() => {
    const editor = {
      getText: () => textRef.current,
      setText: (nextText, origin) => {
        textRef.current = nextText;
        setText(nextText);
        if (textareaRef.current && textareaRef.current.value !== nextText) {
          textareaRef.current.value = nextText;
        }
        if (origin !== 'yjs') {
          listenersRef.current.forEach((listener) => listener(nextText, origin ?? 'local'));
        }
      },
      onChange: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      getEditableElement: () => textareaRef.current,
      setEditable: (enabled) => {
        editableRef.current = enabled;
        setIsEditable(enabled);
        if (textareaRef.current) {
          textareaRef.current.readOnly = !enabled;
          textareaRef.current.classList.toggle('opacity-60', !enabled);
          if (enabled) textareaRef.current.focus();
        }
      },
    };

    onReady(editor);
  }, [onReady]);

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const updateCursor = () => {
    if (!textareaRef.current) return;
    setCursorOffset(textareaRef.current.selectionStart);
  };

  const findNext = () => {
    if (!textareaRef.current || !findQuery) return;
    const haystack = textRef.current;
    const start = textareaRef.current.selectionEnd;
    let index = haystack.indexOf(findQuery, start);
    if (index === -1) index = haystack.indexOf(findQuery);
    if (index === -1) return;

    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(index, index + findQuery.length);
    setCursorOffset(index);
  };

  const replaceOne = () => {
    if (!textareaRef.current || !findQuery) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selected = textRef.current.slice(start, end);
    if (selected !== findQuery) {
      findNext();
      return;
    }
    const nextText =
      textRef.current.slice(0, start) + replaceQuery + textRef.current.slice(end);
    updateText(nextText, 'local');
    const nextPos = start + replaceQuery.length;
    textareaRef.current.setSelectionRange(nextPos, nextPos);
  };

  const replaceAll = () => {
    if (!findQuery) return;
    const nextText = textRef.current.split(findQuery).join(replaceQuery);
    updateText(nextText, 'local');
  };

  const handleKeyDown = (event) => {
    if (!editableRef.current) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave?.();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setFindOpen(true);
      return;
    }

    if (event.key === 'Tab' && textareaRef.current) {
      event.preventDefault();
      const { selectionStart, selectionEnd, value } = textareaRef.current;
      const spaces = ' '.repeat(tabSize);

      if (event.shiftKey) {
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const prefix = value.slice(lineStart, lineStart + tabSize);
        if (prefix === spaces) {
          const nextText = value.slice(0, lineStart) + value.slice(lineStart + tabSize);
          updateText(nextText, 'local');
          textareaRef.current.setSelectionRange(selectionStart - tabSize, selectionEnd - tabSize);
        }
        return;
      }

      const nextText = value.slice(0, selectionStart) + spaces + value.slice(selectionEnd);
      updateText(nextText, 'local');
      const nextPos = selectionStart + spaces.length;
      textareaRef.current.setSelectionRange(nextPos, nextPos);
    }
  };

  const { line, column } = getLineColumn(text, cursorOffset);
  const showEditor = viewMode !== 'preview';
  const showPreview = isMarkdown && viewMode !== 'edit';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${wordWrap ? 'bg-slate-100' : ''}`}
          onClick={() => setWordWrap((value) => !value)}
        >
          줄바꿈
        </button>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          Tab
          <select
            className="rounded border border-slate-200 px-1.5 py-0.5"
            value={tabSize}
            onChange={(event) => setTabSize(Number(event.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <button type="button" className="nas-btn-ghost text-xs" onClick={() => setFindOpen((value) => !value)}>
          찾기 (Ctrl+F)
        </button>
        {isMarkdown && (
          <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
            {(['edit', 'split', 'preview']).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  viewMode === mode ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setViewMode(/** @type {TextEditorViewMode} */ (mode))}
              >
                {mode === 'edit' ? '편집' : mode === 'split' ? '분할' : '미리보기'}
              </button>
            ))}
          </div>
        )}
      </div>

      {findOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <input
            className="rounded border border-slate-200 px-2 py-1"
            placeholder="찾기"
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') findNext();
            }}
          />
          <input
            className="rounded border border-slate-200 px-2 py-1"
            placeholder="바꾸기"
            value={replaceQuery}
            onChange={(event) => setReplaceQuery(event.target.value)}
          />
          <button type="button" className="nas-btn-ghost text-xs" onClick={findNext}>
            다음
          </button>
          <button type="button" className="nas-btn-ghost text-xs" onClick={replaceOne}>
            바꾸기
          </button>
          <button type="button" className="nas-btn-ghost text-xs" onClick={replaceAll}>
            모두 바꾸기
          </button>
        </div>
      )}

      <div className={`flex min-h-0 flex-1 ${showEditor && showPreview ? 'divide-x divide-slate-200' : ''}`}>
        {showEditor && (
          <div className={`relative flex min-h-0 ${showPreview ? 'w-1/2' : 'w-full'}`}>
            <div
              ref={gutterRef}
              className="w-12 shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 py-3 text-right font-mono text-xs leading-6 text-slate-400"
              aria-hidden="true"
            >
              {lineNumbers.map((number) => (
                <div key={number} className="pr-2">
                  {number}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              spellCheck
              readOnly={!isEditable}
              className={`min-h-0 flex-1 resize-none border-0 bg-white py-3 pl-3 pr-4 font-mono text-sm leading-6 text-slate-800 outline-none ${
                isEditable ? '' : 'opacity-60'
              } ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'}`}
              onChange={(event) => {
                if (!editableRef.current) return;
                updateText(event.target.value, 'local');
              }}
              onScroll={syncScroll}
              onClick={updateCursor}
              onKeyUp={updateCursor}
              onKeyDown={handleKeyDown}
              onSelect={updateCursor}
            />
          </div>
        )}

        {showPreview && (
          <div
            className={`markdown-preview overflow-auto bg-white p-6 ${showEditor ? 'w-1/2' : 'w-full'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
        <span>
          Ln {line}, Col {column}
        </span>
        <span>
          {text.length} chars · {text.split(/\s+/).filter(Boolean).length} words · UTF-8
          {isMarkdown ? ' · Markdown' : ' · Plain Text'}
        </span>
      </div>
    </div>
  );
}
