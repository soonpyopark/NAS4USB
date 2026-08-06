import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { gitHubEmojis } from '@tiptap/extension-emoji';
import { IconEmoji } from './TipTapIcons.jsx';

/**
 * Toolbar emoji insert picker (search + grid).
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   disabled?: boolean,
 *   openRequest?: number,
 * }} props
 */
export default function TipTapEmojiPicker({ editor, disabled = false, openRequest = 0 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const listId = useId();
  const lastOpenRequest = useRef(0);

  const emojis = editor?.storage?.emoji?.emojis ?? gitHubEmojis;

  useEffect(() => {
    if (!openRequest || openRequest === lastOpenRequest.current || disabled) return;
    lastOpenRequest.current = openRequest;
    setOpen(true);
  }, [openRequest, disabled]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (emojis || []).filter((item) => item.emoji);
    if (!q) return list.slice(0, 96);
    return list
      .filter((item) => {
        const hay = [item.name, ...(item.shortcodes || []), ...(item.tags || [])]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 96);
  }, [emojis, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const insertEmoji = (item) => {
    const shortcode = item.shortcodes?.[0] || item.name;
    if (!shortcode || !editor) return;
    editor.chain().focus().setEmoji(shortcode).run();
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="tiptap-emoji-picker" ref={rootRef}>
      <button
        type="button"
        className={`tiptap-toolbar__btn${open ? ' is-active' : ''}`}
        disabled={disabled}
        title="이모지 삽입"
        aria-label="이모지 삽입"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <IconEmoji />
      </button>

      {open && (
        <div className="tiptap-emoji-picker__panel" id={listId} role="dialog" aria-label="이모지 선택">
          <input
            ref={inputRef}
            className="tiptap-emoji-picker__search"
            type="search"
            value={query}
            placeholder="검색 (smile, heart…)"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="tiptap-emoji-picker__grid">
            {items.map((item) => (
              <button
                key={item.name}
                type="button"
                className="tiptap-emoji-picker__btn"
                title={`:${item.shortcodes?.[0] || item.name}:`}
                onClick={() => insertEmoji(item)}
              >
                {item.emoji}
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <div className="tiptap-emoji-picker__empty">검색 결과가 없습니다</div>
          )}
          <div className="tiptap-emoji-picker__hint">또는 본문에서 `:` 입력</div>
        </div>
      )}
    </div>
  );
}
