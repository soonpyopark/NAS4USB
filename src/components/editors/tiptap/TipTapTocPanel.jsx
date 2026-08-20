import { useTiptapEditorTick } from '../../../hooks/useTiptapEditorTick.js';

/**
 * Live table-of-contents panel from @tiptap/extension-table-of-contents.
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   open?: boolean,
 *   onClose?: () => void,
 * }} props
 */
export default function TipTapTocPanel({ editor, open = true, onClose }) {
  useTiptapEditorTick(editor);

  if (!editor || !open) return null;

  const items = editor.storage.tableOfContents?.content ?? [];

  return (
    <aside className="tiptap-toc-panel" aria-label="목차">
      <div className="tiptap-toc-panel__header">
        <span>목차</span>
        {onClose && (
          <button type="button" className="tiptap-toc-panel__close" title="닫기" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="tiptap-toc-panel__empty">제목을 추가하면 목차가 표시됩니다</div>
      ) : (
        <nav className="tiptap-toc-panel__list">
          {items.map((item) => (
            <button
              key={item.id || `${item.pos}-${item.textContent}`}
              type="button"
              className={`tiptap-toc-panel__item level-${item.level}${item.isActive ? ' is-active' : ''}${
                item.isScrolledOver ? ' is-scrolled' : ''
              }`}
              style={{ paddingLeft: `${8 + Math.max(0, item.level - 1) * 12}px` }}
              onClick={() => {
                if (editor.isEditable) {
                  editor.chain().focus().setTextSelection(item.pos + 1).run();
                }
                item.dom?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
              }}
            >
              {item.textContent || '(제목 없음)'}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
