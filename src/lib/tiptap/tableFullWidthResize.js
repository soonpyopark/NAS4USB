import { Plugin, PluginKey } from '@tiptap/pm/state';
import { columnResizingPluginKey, TableMap } from '@tiptap/pm/tables';
import {
  CELL_MIN_WIDTH,
  readColumnWidths,
  redistributeFullWidthColumns,
  singleChangedColumnIndex,
  tableColumnCount,
  writeTableColumnWidths,
} from './tableWidthCommands.js';

const fullWidthResizeKey = new PluginKey('nas4usbFullWidthTableResize');

/**
 * @param {import('@tiptap/pm/model').Node} node
 */
function isTableNode(node) {
  return Boolean(node && (node.type.name === 'table' || node.type.spec.tableRole === 'table'));
}

/**
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {number} cellPos
 * @param {number} nextWidth
 * @param {number} minWidth
 */
function previewAbsorbedWidths(view, cellPos, nextWidth, minWidth) {
  const $cell = view.state.doc.resolve(cellPos);
  const table = $cell.node(-1);
  if (!isTableNode(table) || !table.attrs.fullWidth) return;

  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan || 1) - 1;
  const current = readColumnWidths(table, map.width, minWidth);
  const next = redistributeFullWidthColumns(current, col, nextWidth, minWidth);

  let dom = view.domAtPos($cell.start(-1)).node;
  while (dom && dom.nodeName !== 'TABLE') {
    dom = /** @type {Node | null} */ (dom.parentNode);
  }
  if (!(dom instanceof HTMLTableElement)) return;

  const cols = dom.querySelectorAll('colgroup > col');
  next.forEach((width, index) => {
    const colEl = cols[index];
    if (colEl instanceof HTMLElement) colEl.style.width = `${width}px`;
  });
  const total = next.reduce((sum, width) => sum + width, 0);
  dom.style.width = `${total}px`;
  dom.style.minWidth = '';
}

/**
 * After ProseMirror writes one column, keep a full-width table's total by
 * giving the leftover to the neighbor. Also paints that absorb while dragging.
 * @param {number} [cellMinWidth]
 */
export function createFullWidthResizePlugin(cellMinWidth = CELL_MIN_WIDTH) {
  return new Plugin({
    key: fullWidthResizeKey,
    view(editorView) {
      let frame = 0;
      const onMouseMove = (event) => {
        const pluginState = columnResizingPluginKey.getState(editorView.state);
        if (!pluginState?.dragging || pluginState.activeHandle < 0) return;
        const $cell = editorView.state.doc.resolve(pluginState.activeHandle);
        if (!isTableNode($cell.node(-1)) || !$cell.node(-1).attrs.fullWidth) return;
        const nextWidth = Math.max(
          cellMinWidth,
          pluginState.dragging.startWidth + (event.clientX - pluginState.dragging.startX),
        );
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          previewAbsorbedWidths(editorView, pluginState.activeHandle, nextWidth, cellMinWidth);
        });
      };
      window.addEventListener('mousemove', onMouseMove);
      return {
        destroy() {
          if (frame) cancelAnimationFrame(frame);
          window.removeEventListener('mousemove', onMouseMove);
        },
      };
    },
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      let mapped = (pos) => pos;
      for (const transaction of transactions) {
        const previous = mapped;
        mapped = (pos) => transaction.mapping.map(previous(pos));
      }

      const tr = newState.tr;
      let changed = false;

      oldState.doc.descendants((oldNode, oldPos) => {
        if (!isTableNode(oldNode) || !oldNode.attrs.fullWidth) return;
        const newPos = mapped(oldPos);
        const newNode = newState.doc.nodeAt(newPos);
        if (!newNode || !isTableNode(newNode) || !newNode.attrs.fullWidth) return;

        const colCount = tableColumnCount(newNode);
        const before = readColumnWidths(oldNode, colCount, cellMinWidth);
        const after = readColumnWidths(newNode, colCount, cellMinWidth);
        const col = singleChangedColumnIndex(before, after);
        if (col < 0) return;

        const next = redistributeFullWidthColumns(before, col, after[col], cellMinWidth);
        if (next.every((width, index) => width === after[index])) return;
        if (writeTableColumnWidths(tr, newPos, newNode, next)) changed = true;
      });

      return changed ? tr : null;
    },
  });
}
