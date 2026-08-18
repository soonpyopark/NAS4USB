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
const HINT_CLASS = 'tiptap-table-resize-hint';

/**
 * @param {import('@tiptap/pm/model').Node} node
 */
function isTableNode(node) {
  return Boolean(node && (node.type.name === 'table' || node.type.spec.tableRole === 'table'));
}

/**
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {number} cellPos
 * @returns {HTMLTableElement | null}
 */
function findTableElement(view, cellPos) {
  const $cell = view.state.doc.resolve(cellPos);
  let dom = view.domAtPos($cell.start(-1)).node;
  while (dom && dom.nodeName !== 'TABLE') {
    dom = /** @type {Node | null} */ (dom.parentNode);
  }
  return dom instanceof HTMLTableElement ? dom : null;
}

/**
 * @param {import('@tiptap/pm/model').Node} table
 * @param {import('@tiptap/pm/model').ResolvedPos} $cell
 * @param {number} nextWidth
 * @param {number} minWidth
 */
function computeResizeWidths(table, $cell, nextWidth, minWidth) {
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan || 1) - 1;
  const current = readColumnWidths(table, map.width, minWidth);
  const desired = Math.max(minWidth, Math.round(nextWidth));
  const next = table.attrs.fullWidth
    ? redistributeFullWidthColumns(current, col, desired, minWidth)
    : current.map((width, index) => (index === col ? desired : width));
  return {
    col,
    next,
    colWidth: next[col] ?? desired,
    total: next.reduce((sum, width) => sum + width, 0),
  };
}

/**
 * @param {HTMLElement} hint
 */
function hideResizeHint(hint) {
  hint.hidden = true;
}

/**
 * @param {HTMLElement} hint
 * @param {{ clientX: number, clientY: number }} point
 * @param {{ total: number, colWidth: number }} sizes
 */
function showResizeHint(hint, point, sizes) {
  hint.textContent = `표 ${sizes.total}px · 열 ${sizes.colWidth}px`;
  hint.style.left = `${Math.round(point.clientX)}px`;
  hint.style.top = `${Math.round(point.clientY)}px`;
  hint.hidden = false;
}

/**
 * @returns {HTMLElement}
 */
function createResizeHint() {
  const hint = document.createElement('div');
  hint.className = HINT_CLASS;
  hint.hidden = true;
  hint.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hint);
  return hint;
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

  const { next, total } = computeResizeWidths(table, $cell, nextWidth, minWidth);
  const dom = findTableElement(view, cellPos);
  if (!dom) return;

  const cols = dom.querySelectorAll('colgroup > col');
  next.forEach((width, index) => {
    const colEl = cols[index];
    if (colEl instanceof HTMLElement) colEl.style.width = `${width}px`;
  });
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
      const hint = createResizeHint();
      const onPointerMove = (event) => {
        const pluginState = columnResizingPluginKey.getState(editorView.state);
        if (!pluginState?.dragging || pluginState.activeHandle < 0) {
          hideResizeHint(hint);
          return;
        }
        const $cell = editorView.state.doc.resolve(pluginState.activeHandle);
        const table = $cell.node(-1);
        if (!isTableNode(table)) {
          hideResizeHint(hint);
          return;
        }
        const nextWidth = Math.max(
          cellMinWidth,
          pluginState.dragging.startWidth + (event.clientX - pluginState.dragging.startX),
        );
        const point = { clientX: event.clientX, clientY: event.clientY };
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (table.attrs.fullWidth) {
            previewAbsorbedWidths(editorView, pluginState.activeHandle, nextWidth, cellMinWidth);
          }
          showResizeHint(hint, point, computeResizeWidths(table, $cell, nextWidth, cellMinWidth));
        });
      };
      const onPointerUp = () => {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        hideResizeHint(hint);
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      return {
        destroy() {
          if (frame) cancelAnimationFrame(frame);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
          hint.remove();
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
