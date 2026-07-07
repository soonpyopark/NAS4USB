import { mergeAttributes } from '@tiptap/core';
import Paragraph from '@tiptap/extension-paragraph';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { mergeInlineStyle } from './htmlEditorStyles.js';

/** 신규 표 기본 너비 — 편집 영역(또는 셀) 기준 100% */
export const TABLE_FULL_WIDTH_STYLE = 'width: 100%';

const styleAttribute = {
  default: null,
  parseHTML: (element) => element.getAttribute('style') || null,
  renderHTML: (attributes) => {
    if (!attributes.style) return {};
    return { style: attributes.style };
  },
};

/** @param {import('@tiptap/core').Extension} Base */
function withStyleAttribute(Base) {
  return Base.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        style: styleAttribute,
      };
    },
  });
}

/**
 * @param {import('prosemirror-state').Transaction} tr
 * @param {import('prosemirror-state').EditorState} state
 */
export function applyFullWidthToFocusedTable(tr, state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'table') continue;

    const pos = $from.before(depth);
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      style: mergeInlineStyle(node.attrs.style, { width: '100%' }),
    });
    return true;
  }
  return false;
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {{ rows?: number, cols?: number, withHeaderRow?: boolean }} [options]
 */
export function insertFullWidthTable(editor, options = {}) {
  const { rows = 3, cols = 3, withHeaderRow = true } = options;
  return editor
    .chain()
    .focus()
    .insertTable({ rows, cols, withHeaderRow })
    .command(({ tr, state }) => {
      const nextState = state.apply(tr);
      return applyFullWidthToFocusedTable(tr, nextState);
    })
    .run();
}

export const StyledParagraph = withStyleAttribute(Paragraph);

/** 셀 안에 블록 표(중첩 표) 삽입을 허용하는 TableCell */
export const NestedTableCell = withStyleAttribute(TableCell).extend({
  content: '(block | table)+',
});

export const NestedTableHeader = withStyleAttribute(TableHeader).extend({
  content: '(block | table)+',
});

export const NestedTable = withStyleAttribute(Table).extend({
  resizable: true,
  allowTableNodeSelection: true,

  renderHTML({ node, HTMLAttributes }) {
    /** @type {Array<[string, Record<string, string>?]>} */
    const cols = [];
    const row = node.firstChild;
    if (row) {
      for (let i = 0; i < row.childCount; i += 1) {
        const { colspan, colwidth } = row.child(i).attrs;
        for (let j = 0; j < colspan; j += 1) {
          const width = colwidth && colwidth[j];
          cols.push(width ? ['col', { style: `width: ${width}px` }] : ['col', {}]);
        }
      }
    }

    const style = HTMLAttributes.style ?? node.attrs.style ?? null;
    const tableAttrs = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      style ? { style } : {},
    );

    const tableChildren = cols.length > 0 ? [['colgroup', {}, ...cols], ['tbody', 0]] : [['tbody', 0]];
    const table = ['table', tableAttrs, ...tableChildren];
    return this.options.renderWrapper ? ['div', { class: 'tableWrapper' }, table] : table;
  },
});

export const nestedTableExtensions = [
  NestedTable.configure({ resizable: true }),
  TableRow,
  NestedTableHeader,
  NestedTableCell,
];
