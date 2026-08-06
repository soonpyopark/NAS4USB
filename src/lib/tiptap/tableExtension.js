import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { columnResizing, tableEditing } from '@tiptap/pm/tables';

/**
 * TableCell / TableHeader with cell background + horizontal align.
 */
export const TiptapTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-background-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

export const TiptapTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-background-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

export const TiptapTableRow = TableRow;

/**
 * Table with column resizing always registered when `resizable` is true.
 * TipTap's default skips columnResizing while `!editable`, so sync/read-only
 * bootstrap would permanently lose resize handles after setEditable(true).
 */
export const TiptapTable = Table.extend({
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable;
    return [
      ...(isResizable
        ? [
            columnResizing({
              handleWidth: this.options.handleWidth,
              cellMinWidth: this.options.cellMinWidth,
              defaultCellMinWidth: this.options.cellMinWidth,
              View: this.options.View,
              lastColumnResizable: this.options.lastColumnResizable,
            }),
          ]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },
});

/** @returns {import('@tiptap/core').Extensions} */
export function createTiptapTableExtensions() {
  return [
    TiptapTable.configure({
      resizable: true,
      allowTableNodeSelection: true,
      lastColumnResizable: true,
      cellMinWidth: 80,
      renderWrapper: true,
      HTMLAttributes: { class: 'tiptap-table' },
    }),
    TiptapTableRow,
    TiptapTableHeader,
    TiptapTableCell,
  ];
}
