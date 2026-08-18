import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { columnResizing, tableEditing } from '@tiptap/pm/tables';
import { createFullWidthResizePlugin } from './tableFullWidthResize.js';

function parseTableFullWidth(element) {
  const table =
    element instanceof HTMLElement && element.tagName === 'TABLE'
      ? element
      : element instanceof HTMLElement
        ? element.querySelector('table')
        : null;
  const target = table || element;
  if (!(target instanceof HTMLElement)) return false;
  return target.getAttribute('data-full-width') === 'true';
}

/**
 * OneNote uses `background: rgb(...)` shorthand; some DOMs leave
 * `style.backgroundColor` empty until computed.
 * @param {HTMLElement} element
 */
function parseCellBackground(element) {
  const fromAttr = element.getAttribute('data-background-color');
  if (fromAttr) return fromAttr;
  if (element.style.backgroundColor) return element.style.backgroundColor;
  if (element.style.background && !/url\(|gradient/i.test(element.style.background)) {
    return element.style.background;
  }
  const style = element.getAttribute('style') || '';
  const match = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
  const value = match?.[1]?.trim();
  if (value && !/url\(|gradient/i.test(value)) return value;
  return null;
}

/**
 * TableCell / TableHeader with cell background + horizontal align.
 */
export const TiptapTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: parseCellBackground,
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
        parseHTML: parseCellBackground,
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
  addAttributes() {
    return {
      ...this.parent?.(),
      fullWidth: {
        default: false,
        parseHTML: parseTableFullWidth,
        renderHTML: (attributes) =>
          attributes.fullWidth ? { 'data-full-width': 'true' } : {},
      },
    };
  },
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
            createFullWidthResizePlugin(this.options.cellMinWidth),
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
