import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { loadLanguageExtensionsForFile } from '../../../lib/text/codeMirrorSetup.js';

/**
 * @param {{
 *   value: string,
 *   dirty?: boolean,
 *   applying?: boolean,
 *   onChange: (value: string) => void,
 *   onApply: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function TipTapHtmlSourcePanel({
  value,
  dirty = false,
  applying = false,
  onChange,
  onApply,
  onCancel,
}) {
  const parentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const viewRef = useRef(/** @type {EditorView | null} */ (null));
  const readOnlyCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onApplyRef = useRef(onApply);
  const onCancelRef = useRef(onCancel);
  const applyingRef = useRef(applying);
  const dirtyRef = useRef(dirty);
  const initialValueRef = useRef(value);

  onChangeRef.current = onChange;
  onApplyRef.current = onApply;
  onCancelRef.current = onCancel;
  applyingRef.current = applying;
  dirtyRef.current = dirty;

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return undefined;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          langCompartment.current.of([]),
          oneDark,
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          readOnlyCompartment.current.of(EditorState.readOnly.of(false)),
          Prec.highest(
            keymap.of([
              {
                key: 'Escape',
                run: () => {
                  onCancelRef.current();
                  return true;
                },
              },
              {
                key: 'Mod-Enter',
                run: () => {
                  if (!applyingRef.current && dirtyRef.current) onApplyRef.current();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([indentWithTab]),
          EditorView.contentAttributes.of({ 'aria-label': 'HTML 편집' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              lineHeight: '1.55',
            },
            '.cm-content': { padding: '12px 0 24px' },
            '.cm-gutters': { borderRight: '1px solid #1e293b' },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();

    void loadLanguageExtensionsForFile({ fileName: 'index.html' }).then((extensions) => {
      if (viewRef.current !== view) return;
      view.dispatch({
        effects: langCompartment.current.reconfigure(extensions),
      });
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(applying)),
    });
  }, [applying]);

  return (
    <div className="tiptap-html-source">
      <div className="tiptap-html-source__bar">
        <p className="tiptap-html-source__hint">
          지원하지 않는 태그는 적용 시 정리될 수 있습니다. Ctrl+Enter 적용 · Esc 취소
        </p>
        <div className="tiptap-html-source__actions">
          <button
            type="button"
            className="tiptap-html-source__btn"
            disabled={applying}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="button"
            className="tiptap-html-source__btn tiptap-html-source__btn--primary"
            disabled={applying || !dirty}
            onClick={onApply}
          >
            {applying ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
      <div ref={parentRef} className="tiptap-html-source__editor" />
    </div>
  );
}
