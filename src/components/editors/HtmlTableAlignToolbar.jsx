import { applyHtmlTableCellAlignment } from '../../lib/tiptap/htmlEditorStyles.js';

/**
 * @param {object} props
 * @param {import('@tiptap/core').Editor} props.editor
 * @param {boolean} props.disabled
 */
export default function HtmlTableAlignToolbar({ editor, disabled }) {
  const align = (patch) => {
    applyHtmlTableCellAlignment(editor, patch);
  };

  return (
    <>
      <span className="text-[10px] text-slate-500">가로</span>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="가로 왼쪽 정렬 (현재 표 셀)"
        onClick={() => align({ textAlign: 'left' })}
      >
        ←
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="가로 가운데 정렬 (현재 표 셀)"
        onClick={() => align({ textAlign: 'center' })}
      >
        ↔
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="가로 오른쪽 정렬 (현재 표 셀)"
        onClick={() => align({ textAlign: 'right' })}
      >
        →
      </button>
      <span className="text-[10px] text-slate-500">세로</span>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="세로 위 정렬 (현재 표 셀)"
        onClick={() => align({ verticalAlign: 'top' })}
      >
        ↑
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="세로 가운데 정렬 (현재 표 셀)"
        onClick={() => align({ verticalAlign: 'middle' })}
      >
        ↕
      </button>
      <button
        type="button"
        className="tiptap-toolbar-btn min-w-[1.75rem]"
        disabled={disabled}
        title="세로 아래 정렬 (현재 표 셀)"
        onClick={() => align({ verticalAlign: 'bottom' })}
      >
        ↓
      </button>
    </>
  );
}
