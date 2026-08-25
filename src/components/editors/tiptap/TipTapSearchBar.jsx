import { useEffect, useRef, useState } from 'react';
import { getTiptapSearchState } from '../../../lib/tiptap/searchExtension.js';
import { useTiptapEditorTick } from '../../../hooks/useTiptapEditorTick.js';

/**
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   open: boolean,
 *   readOnly?: boolean,
 *   focusNonce?: number,
 *   initialQuery?: string,
 *   onClose?: () => void,
 * }} props
 */
export default function TipTapSearchBar({
  editor,
  open,
  readOnly = false,
  focusNonce = 0,
  initialQuery = '',
  onClose,
}) {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const seededRef = useRef(false);
  const [query, setQuery] = useState(() => String(initialQuery ?? '').trim());
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  useTiptapEditorTick(editor);

  const search = getTiptapSearchState(editor.state);
  const total = search.results.length;
  const current = total ? search.index + 1 : 0;

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      editor.commands.setSearchQuery('');
      return undefined;
    }
    const incoming = String(initialQuery ?? '').trim();
    if (incoming && !seededRef.current) {
      seededRef.current = true;
      setQuery(incoming);
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editor, focusNonce, initialQuery, open]);

  useEffect(() => {
    if (!open) return;
    editor.commands.setSearchQuery(query, { caseSensitive });
    if (query.trim()) editor.commands.goToSearchResult(0);
  }, [caseSensitive, editor, open, query]);

  const go = (direction) => {
    editor.commands.goToSearchResult(direction);
    inputRef.current?.focus();
  };

  const replaceCurrent = () => {
    const match = search.results[search.index];
    if (!match || readOnly) return;
    editor
      .chain()
      .command(({ tr }) => {
        tr.insertText(replace, match.from, match.to);
        return true;
      })
      .run();
    editor.commands.setSearchQuery(query, { caseSensitive });
    editor.commands.goToSearchResult(1);
    inputRef.current?.focus();
  };

  const replaceAll = () => {
    if (readOnly || !query || search.results.length === 0) return;
    const matches = [...search.results].reverse();
    let chain = editor.chain();
    for (const match of matches) {
      chain = chain.command(({ tr }) => {
        tr.insertText(replace, match.from, match.to);
        return true;
      });
    }
    chain.run();
    editor.commands.setSearchQuery(query, { caseSensitive });
    inputRef.current?.focus();
  };

  const goRef = useRef(go);
  const replaceCurrentRef = useRef(replaceCurrent);
  const onCloseRef = useRef(onClose);
  goRef.current = go;
  replaceCurrentRef.current = replaceCurrent;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Enter') return;

      const target = event.target;
      const inReplace =
        target instanceof HTMLElement &&
        target.classList.contains('tiptap-search-bar__input--replace');

      event.preventDefault();
      event.stopPropagation();

      if (inReplace && !event.shiftKey && !readOnly) {
        replaceCurrentRef.current();
        return;
      }

      goRef.current(event.shiftKey ? -1 : 1);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, readOnly]);

  if (!open) return null;

  return (
    <div className="tiptap-search-bar print-hide" role="search">
      <input
        ref={inputRef}
        type="search"
        className="tiptap-search-bar__input"
        placeholder="본문 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            go(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose?.();
          }
        }}
      />
      <span className="tiptap-search-bar__count">
        {query.trim() ? (total ? `${current}/${total}` : '없음') : ''}
      </span>
      <button type="button" className="tiptap-toolbar__btn" title="이전" onClick={() => go(-1)}>
        ↑
      </button>
      <button type="button" className="tiptap-toolbar__btn" title="다음" onClick={() => go(1)}>
        ↓
      </button>
      <label className="tiptap-search-bar__case">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => setCaseSensitive(event.target.checked)}
        />
        대소문자
      </label>
      {!readOnly && (
        <>
          <input
            type="text"
            className="tiptap-search-bar__input tiptap-search-bar__input--replace"
            placeholder="바꿀 내용"
            value={replace}
            onChange={(event) => setReplace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                replaceCurrent();
              }
            }}
          />
          <button
            type="button"
            className="tiptap-toolbar__btn"
            title="바꾸기"
            disabled={!total}
            onClick={replaceCurrent}
          >
            바꾸기
          </button>
          <button
            type="button"
            className="tiptap-toolbar__btn"
            title="모두 바꾸기"
            disabled={!total}
            onClick={replaceAll}
          >
            모두
          </button>
        </>
      )}
      <button type="button" className="tiptap-toolbar__btn" title="닫기 (Esc)" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
