import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightTrailingWhitespace,
  highlightWhitespace,
} from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { getLineColumn } from '../../lib/text/textIO.js';
import { renderMarkdown } from '../../lib/text/markdown.js';
import {
  createFullCodeMirrorExtensions,
  getLanguageLabel,
  loadLanguageExtensionsForFile,
  openFindPanel,
  openGotoLineOnce,
} from '../../lib/text/codeMirrorSetup.js';
import { useSpellcheckEnabled } from '../../hooks/useSpellcheckEnabled.js';

/**
 * @typedef {'edit' | 'split' | 'preview'} TextEditorViewMode
 */

/**
 * @param {object} props
 * @param {string} props.initialText
 * @param {string} [props.fileName]
 * @param {boolean} [props.isMarkdown]
 * @param {(editor: import('../../lib/rhwp/types.js').RhwpEditorHandle) => void} props.onReady
 * @param {() => void} [props.onSave]
 */
export default function TextEditor({
  initialText,
  fileName = '',
  isMarkdown = false,
  onReady,
  onSave,
}) {
  const parentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const viewRef = useRef(/** @type {EditorView | null} */ (null));
  const listenersRef = useRef(new Set());
  const textRef = useRef(initialText);
  const editableRef = useRef(false);
  const suppressNotifyRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onReadyRef = useRef(onReady);

  const readOnlyCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const tabCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const whitespaceCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const spellcheckCompartment = useRef(new Compartment());

  const [text, setText] = useState(initialText);
  const [wordWrap, setWordWrap] = useState(true);
  const [tabSize, setTabSize] = useState(2);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [viewMode, setViewMode] = useState(
    /** @type {TextEditorViewMode} */ (isMarkdown ? 'split' : 'edit'),
  );
  const [cursorOffset, setCursorOffset] = useState(0);
  const [isEditable, setIsEditable] = useState(false);
  const [languageLabel, setLanguageLabel] = useState(() =>
    getLanguageLabel({ fileName, isMarkdown }),
  );
  const spellcheckEnabled = useSpellcheckEnabled();

  onSaveRef.current = onSave;
  onReadyRef.current = onReady;

  const previewHtml = useMemo(
    () => (isMarkdown ? renderMarkdown(text) : ''),
    [isMarkdown, text],
  );

  const notify = useCallback((origin = 'local') => {
    listenersRef.current.forEach((listener) => listener(textRef.current, origin));
  }, []);

  useEffect(() => {
    if (!parentRef.current || viewRef.current) return undefined;

    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          ...createFullCodeMirrorExtensions({
            isMarkdown,
            onSave: () => onSaveRef.current?.(),
          }),
          langCompartment.current.of([]),
          wrapCompartment.current.of(EditorView.lineWrapping),
          tabCompartment.current.of([EditorState.tabSize.of(2), indentUnit.of('  ')]),
          whitespaceCompartment.current.of(highlightTrailingWhitespace()),
          themeCompartment.current.of([]),
          spellcheckCompartment.current.of(
            EditorView.contentAttributes.of({
              spellcheck: spellcheckEnabled ? 'true' : 'false',
            }),
          ),
          readOnlyCompartment.current.of([
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextText = update.state.doc.toString();
              textRef.current = nextText;
              setText(nextText);
              if (!suppressNotifyRef.current && editableRef.current) {
                notify('local');
              }
            }
            if (update.selectionSet) {
              setCursorOffset(update.state.selection.main.head);
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    textRef.current = initialText;
    setText(initialText);

    /** @type {import('../../lib/rhwp/types.js').RhwpEditorHandle} */
    const editor = {
      getText: () => textRef.current,
      setText: (nextText, origin) => {
        const next = String(nextText ?? '');
        textRef.current = next;
        setText(next);

        const currentView = viewRef.current;
        if (!currentView) {
          if (origin !== 'yjs') notify(origin ?? 'local');
          return;
        }

        const current = currentView.state.doc.toString();
        if (current === next) {
          if (origin !== 'yjs') notify(origin ?? 'local');
          return;
        }

        suppressNotifyRef.current = true;
        currentView.dispatch({
          changes: { from: 0, to: currentView.state.doc.length, insert: next },
        });
        suppressNotifyRef.current = false;

        if (origin !== 'yjs') {
          notify(origin ?? 'local');
        }
      },
      onChange: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      getEditableElement: () => viewRef.current?.contentDOM ?? null,
      setEditable: (enabled) => {
        editableRef.current = enabled;
        setIsEditable(enabled);
        const currentView = viewRef.current;
        if (!currentView) return;
        currentView.dispatch({
          effects: readOnlyCompartment.current.reconfigure([
            EditorState.readOnly.of(!enabled),
            EditorView.editable.of(enabled),
          ]),
        });
        if (enabled) currentView.focus();
      },
    };

    onReadyRef.current(editor);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-time CodeMirror mount
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: spellcheckCompartment.current.reconfigure(
        EditorView.contentAttributes.of({
          spellcheck: spellcheckEnabled ? 'true' : 'false',
        }),
      ),
    });
  }, [spellcheckEnabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === initialText) {
      textRef.current = initialText;
      setText(initialText);
      return;
    }
    suppressNotifyRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialText },
    });
    suppressNotifyRef.current = false;
    textRef.current = initialText;
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    let cancelled = false;
    setLanguageLabel(getLanguageLabel({ fileName, isMarkdown }));

    void loadLanguageExtensionsForFile({ fileName, isMarkdown }).then((extensions) => {
      if (cancelled) return;
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: langCompartment.current.reconfigure(extensions),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [fileName, isMarkdown]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: tabCompartment.current.reconfigure([
        EditorState.tabSize.of(tabSize),
        indentUnit.of(' '.repeat(tabSize)),
      ]),
    });
  }, [tabSize]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: whitespaceCompartment.current.reconfigure(
        showWhitespace
          ? [highlightWhitespace(), highlightTrailingWhitespace()]
          : highlightTrailingWhitespace(),
      ),
    });
  }, [showWhitespace]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(darkTheme ? oneDark : []),
    });
  }, [darkTheme]);

  useEffect(() => {
    if (viewMode === 'preview') return;
    viewRef.current?.requestMeasure();
  }, [viewMode]);

  const openFind = () => {
    const view = viewRef.current;
    if (!view) return;
    openFindPanel(view);
  };

  const openGoto = () => {
    const view = viewRef.current;
    if (!view) return;
    openGotoLineOnce(view);
  };

  const { line, column } = getLineColumn(text, cursorOffset);
  const showEditor = viewMode !== 'preview';
  const showPreview = isMarkdown && viewMode !== 'edit';

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${darkTheme ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div
        className={`print-hide flex flex-wrap items-center gap-2 border-b px-3 py-2 ${
          darkTheme ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${wordWrap ? 'bg-slate-100' : ''} ${
            darkTheme ? 'text-slate-200 hover:bg-slate-800' : ''
          }`}
          onClick={() => setWordWrap((value) => !value)}
        >
          줄바꿈
        </button>
        <label
          className={`flex items-center gap-1 text-xs ${darkTheme ? 'text-slate-300' : 'text-slate-600'}`}
        >
          Tab
          <select
            className={`rounded border px-1.5 py-0.5 ${
              darkTheme ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-200'
            }`}
            value={tabSize}
            onChange={(event) => setTabSize(Number(event.target.value))}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${showWhitespace ? 'bg-slate-100' : ''} ${
            darkTheme ? 'text-slate-200 hover:bg-slate-800' : ''
          }`}
          onClick={() => setShowWhitespace((value) => !value)}
          title="공백·탭 표시"
        >
          공백표시
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${darkTheme ? 'bg-slate-700 text-slate-100' : ''}`}
          onClick={() => setDarkTheme((value) => !value)}
        >
          {darkTheme ? '라이트' : '다크'}
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${darkTheme ? 'text-slate-200 hover:bg-slate-800' : ''}`}
          onClick={openFind}
          disabled={!showEditor}
        >
          찾기 (Ctrl+F)
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${darkTheme ? 'text-slate-200 hover:bg-slate-800' : ''}`}
          onClick={openGoto}
          disabled={!showEditor}
          title="Ctrl+Shift+O"
        >
          줄이동
        </button>
        <span className={`text-[11px] ${darkTheme ? 'text-slate-500' : 'text-slate-400'}`}>
          CodeMirror 전체 기능
        </span>
        {isMarkdown && (
          <div
            className={`ml-auto flex items-center gap-1 rounded-md border p-0.5 ${
              darkTheme ? 'border-slate-600' : 'border-slate-200'
            }`}
          >
            {(['edit', 'split', 'preview']).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  viewMode === mode
                    ? darkTheme
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-800 text-white'
                    : darkTheme
                      ? 'text-slate-300 hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setViewMode(/** @type {TextEditorViewMode} */ (mode))}
              >
                {mode === 'edit' ? '편집' : mode === 'split' ? '분할' : '미리보기'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`flex min-h-0 flex-1 ${showEditor && showPreview ? 'divide-x divide-slate-200' : ''}`}>
        <div
          className={`relative min-h-0 overflow-hidden ${darkTheme ? 'bg-slate-900' : 'bg-white'} ${
            showEditor ? (showPreview ? 'w-1/2' : 'w-full') : 'hidden'
          } ${isEditable ? '' : 'opacity-60'}`}
        >
          <div ref={parentRef} className="h-full min-h-0 w-full [&_.cm-editor]:h-full" />
        </div>

        {showPreview && (
          <div
            className={`markdown-preview overflow-auto p-6 ${
              darkTheme ? 'bg-slate-900 text-slate-100' : 'bg-white'
            } ${showEditor ? 'w-1/2' : 'w-full'}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      <div
        className={`print-hide flex items-center justify-between border-t px-3 py-1.5 text-[11px] ${
          darkTheme
            ? 'border-slate-700 bg-slate-900 text-slate-400'
            : 'border-slate-200 bg-white text-slate-500'
        }`}
      >
        <span>
          Ln {line}, Col {column}
        </span>
        <span>
          {text.length} chars · {text.split(/\s+/).filter(Boolean).length} words · UTF-8
          {` · ${languageLabel}`} · lint · fold · search · autocomplete
        </span>
      </div>
    </div>
  );
}
