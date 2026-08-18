import TipTapColorSwatchPicker from './TipTapColorSwatchPicker.jsx';
import { TIPTAP_CELL_BG_COLORS } from '../../../lib/tiptap/colorPalettes.js';
import { equalizeTableColumns, fitTableToFullWidth } from '../../../lib/tiptap/tableWidthCommands.js';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCellNext,
  IconCellPrev,
  IconColAfter,
  IconColBefore,
  IconColDelete,
  IconEqualColumns,
  IconFixTable,
  IconHeaderCell,
  IconHeaderCol,
  IconHeaderRow,
  IconMergeCells,
  IconMergeToggle,
  IconRowAfter,
  IconRowBefore,
  IconRowDelete,
  IconSplitCell,
  IconTable,
  IconTableFullWidth,
  IconTrash,
} from './TipTapIcons.jsx';

/**
 * Full in-table editing command bar (icon-only).
 * @param {{
 *   editor: import('@tiptap/core').Editor,
 *   disabled?: boolean,
 * }} props
 */
export default function TipTapTableControls({ editor, disabled = false }) {
  if (!editor || !editor.isActive('table')) return null;

  const cellAlign =
    editor.getAttributes('tableCell').align || editor.getAttributes('tableHeader').align || '';
  const cellBg =
    editor.getAttributes('tableCell').backgroundColor ||
    editor.getAttributes('tableHeader').backgroundColor ||
    '';

  const setCellAlign = (align) => {
    editor.chain().focus().setCellAttribute('align', align || null).run();
  };

  const setCellBackground = (backgroundColor) => {
    editor.chain().setCellAttribute('backgroundColor', backgroundColor || null).run();
  };

  return (
    <div className="tiptap-toolbar__row tiptap-toolbar__row--table">
      <span className="tiptap-toolbar__label" title="표 편집">
        <IconTable />
      </span>

      <ToolbarGroup>
        <ToolbarButton
          title="앞에 열 추가"
          disabled={disabled || !editor.can().addColumnBefore()}
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          <IconColBefore />
        </ToolbarButton>
        <ToolbarButton
          title="뒤에 열 추가"
          disabled={disabled || !editor.can().addColumnAfter()}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <IconColAfter />
        </ToolbarButton>
        <ToolbarButton
          title="열 삭제"
          disabled={disabled || !editor.can().deleteColumn()}
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <IconColDelete />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="위에 행 추가"
          disabled={disabled || !editor.can().addRowBefore()}
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          <IconRowBefore />
        </ToolbarButton>
        <ToolbarButton
          title="아래에 행 추가"
          disabled={disabled || !editor.can().addRowAfter()}
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <IconRowAfter />
        </ToolbarButton>
        <ToolbarButton
          title="행 삭제"
          disabled={disabled || !editor.can().deleteRow()}
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <IconRowDelete />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="셀 병합"
          disabled={disabled || !editor.can().mergeCells()}
          onClick={() => editor.chain().focus().mergeCells().run()}
        >
          <IconMergeCells />
        </ToolbarButton>
        <ToolbarButton
          title="셀 분할"
          disabled={disabled || !editor.can().splitCell()}
          onClick={() => editor.chain().focus().splitCell().run()}
        >
          <IconSplitCell />
        </ToolbarButton>
        <ToolbarButton
          title="병합/분할 토글"
          disabled={disabled || !editor.can().mergeOrSplit()}
          onClick={() => editor.chain().focus().mergeOrSplit().run()}
        >
          <IconMergeToggle />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="헤더 행 토글"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        >
          <IconHeaderRow />
        </ToolbarButton>
        <ToolbarButton
          title="헤더 열 토글"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
        >
          <IconHeaderCol />
        </ToolbarButton>
        <ToolbarButton
          title="헤더 셀 토글"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeaderCell().run()}
        >
          <IconHeaderCell />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="셀 왼쪽 정렬"
          active={cellAlign === 'left'}
          disabled={disabled}
          onClick={() => setCellAlign('left')}
        >
          <IconAlignLeft />
        </ToolbarButton>
        <ToolbarButton
          title="셀 가운데 정렬"
          active={cellAlign === 'center'}
          disabled={disabled}
          onClick={() => setCellAlign('center')}
        >
          <IconAlignCenter />
        </ToolbarButton>
        <ToolbarButton
          title="셀 오른쪽 정렬"
          active={cellAlign === 'right'}
          disabled={disabled}
          onClick={() => setCellAlign('right')}
        >
          <IconAlignRight />
        </ToolbarButton>
        <TipTapColorSwatchPicker
          title="셀 배경색"
          mode="fill"
          disabled={disabled}
          value={cellBg}
          colors={TIPTAP_CELL_BG_COLORS}
          onChange={setCellBackground}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="표 너비 100%"
          disabled={disabled}
          onClick={() => {
            editor.chain().focus().run();
            fitTableToFullWidth(editor);
          }}
        >
          <IconTableFullWidth />
        </ToolbarButton>
        <ToolbarButton
          title="열 너비 균등"
          disabled={disabled}
          onClick={() => {
            editor.chain().focus().run();
            equalizeTableColumns(editor);
          }}
        >
          <IconEqualColumns />
        </ToolbarButton>
        <ToolbarButton
          title="다음 셀 (Tab)"
          disabled={disabled || !editor.can().goToNextCell()}
          onClick={() => editor.chain().focus().goToNextCell().run()}
        >
          <IconCellNext />
        </ToolbarButton>
        <ToolbarButton
          title="이전 셀 (Shift+Tab)"
          disabled={disabled || !editor.can().goToPreviousCell()}
          onClick={() => editor.chain().focus().goToPreviousCell().run()}
        >
          <IconCellPrev />
        </ToolbarButton>
        <ToolbarButton
          title="표 구조 복구"
          disabled={disabled}
          onClick={() => editor.chain().focus().fixTables().run()}
        >
          <IconFixTable />
        </ToolbarButton>
        <ToolbarButton
          title="표 삭제"
          disabled={disabled || !editor.can().deleteTable()}
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <IconTrash />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}

function ToolbarGroup({ children }) {
  return <div className="tiptap-toolbar__group">{children}</div>;
}

function ToolbarButton({ children, active = false, disabled = false, title, onClick }) {
  return (
    <button
      type="button"
      className={`tiptap-toolbar__btn${active ? ' is-active' : ''}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
