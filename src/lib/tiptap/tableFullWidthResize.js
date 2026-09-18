import { Plugin, PluginKey } from '@tiptap/pm/state';
import { columnResizingPluginKey, TableMap } from '@tiptap/pm/tables';
import {
  CELL_MIN_WIDTH,
  minWidthForBudget,
  readColumnWidths,
  resizeColumnLeavingLastAuto,
  tableWidthBudget,
  writeTableColumnWidths,
} from './tableWidthCommands.js';
import { previewColgroupWidths } from './tableView.js';

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
 * @param {number} tablePos
 * @returns {HTMLTableElement | null}
 */
function tableDomAt(view, tablePos) {
  const nodeDom = view.nodeDOM(tablePos);
  if (nodeDom instanceof HTMLTableElement) return nodeDom;
  if (nodeDom instanceof HTMLElement) {
    const direct = nodeDom.querySelector(':scope > table');
    if (direct instanceof HTMLTableElement) return direct;
  }
  return null;
}

/**
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {number} cellPos
 * @param {{ colspan?: number, colwidth?: number[] | null }} attrs
 */
function currentColWidth(view, cellPos, attrs) {
  const colspan = Math.max(1, Number(attrs.colspan) || 1);
  const colwidth = Array.isArray(attrs.colwidth) ? attrs.colwidth : null;
  const width = colwidth && colwidth[colwidth.length - 1];
  if (width) return width;
  const dom = view.domAtPos(cellPos);
  const node = dom.node.childNodes[dom.offset];
  let domWidth = node instanceof HTMLElement ? node.offsetWidth : 0;
  let parts = colspan;
  if (colwidth) {
    for (let i = 0; i < colspan; i += 1) {
      if (colwidth[i]) {
        domWidth -= colwidth[i];
        parts -= 1;
      }
    }
  }
  return parts > 0 ? domWidth / parts : CELL_MIN_WIDTH;
}

/**
 * Innermost table around a cell — nested tables must not reuse the outer table.
 * @param {import('@tiptap/pm/model').ResolvedPos} $pos
 * @returns {{ node: import('@tiptap/pm/model').Node, pos: number, start: number } | null}
 */
function innermostTable($pos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isTableNode(node)) {
      return { node, pos: $pos.before(depth), start: $pos.start(depth) };
    }
  }
  return null;
}

function computeResizeWidths(_table, $cell, nextWidth, minWidth, view) {
  try {
    const found = innermostTable($cell);
    if (!found) return null;
    const table = found.node;
    const map = TableMap.get(table);
    const col = map.colCount($cell.pos - found.start) + ($cell.nodeAfter?.attrs.colspan || 1) - 1;
    if (col < 0 || col >= map.width) return null;
    const current = readColumnWidths(table, map.width, minWidth);
    const budget = tableWidthBudget($cell.doc, found.pos, null, view);
    const minUsed = minWidthForBudget(map.width, budget, minWidth);
    const last = map.width - 1;
    const targetCol = col === last && last > 0 ? last - 1 : col;
    const targetWidth =
      col === last && last > 0
        ? budget - Math.max(minUsed, Math.round(nextWidth))
        : nextWidth;
    const next = resizeColumnLeavingLastAuto(current, targetCol, targetWidth, budget, minUsed);
    const explicit = next
      .slice(0, last)
      .reduce((sum, width) => sum + (Number(width) > 0 ? Number(width) : 0), 0);
    return {
      table,
      tablePos: found.pos,
      col,
      next,
      colWidth:
        col === last ? Math.max(minUsed, budget - explicit) : (next[col] ?? Math.round(nextWidth)),
      total: budget,
      lockFullWidth: true,
    };
  } catch {
    return null;
  }
}

/**
 * Live preview while dragging. Only the dragged column gets a px width; the
 * last column stays unsized so `width: 100%` keeps the table on the editor.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {number} cellPos
 * @param {number} nextWidth
 * @param {number} minWidth
 */
function previewColumnResize(view, cellPos, nextWidth, minWidth) {
  const $cell = view.state.doc.resolve(cellPos);
  const sizes = computeResizeWidths(null, $cell, nextWidth, minWidth, view);
  if (!sizes) return;
  const tableDom = tableDomAt(view, sizes.tablePos);
  if (!tableDom) return;
  previewColgroupWidths(tableDom, sizes.next);
}

/**
 * Commit one resize in a single transaction. Neighbor absorb used to live in
 * `appendTransaction` and ping-pong with `fixTables` until the renderer froze.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {number} cellPos
 * @param {number} nextWidth
 * @param {number} minWidth
 */
function commitColumnResize(view, cellPos, nextWidth, minWidth) {
  const tr = view.state.tr;
  tr.setMeta(columnResizingPluginKey, { setDragging: null });
  try {
    const $cell = view.state.doc.resolve(cellPos);
    const sizes = computeResizeWidths(null, $cell, nextWidth, minWidth, view);
    if (sizes) {
      writeTableColumnWidths(tr, sizes.tablePos, sizes.table, sizes.next, {
        fullWidth: true,
        lastColumnAuto: true,
      });
    }
  } catch (error) {
    console.warn('[tiptap] table resize commit failed', error);
  }
  view.dispatch(tr);
}

/**
 * Stock `columnResizing` attaches raw window listeners whose `TableMap.get` /
 * `colCount` throws after 「표 너비 100%」 and takes the Electron renderer down.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {MouseEvent} event
 * @param {number} cellMinWidth
 */
export function safeColumnResizeMouseDown(view, event, cellMinWidth) {
  if (!view.editable || view.isDestroyed) return false;
  const win = view.dom.ownerDocument.defaultView ?? window;
  const pluginState = columnResizingPluginKey.getState(view.state);
  if (!pluginState || pluginState.activeHandle < 0 || pluginState.dragging) return false;

  const cellPos = pluginState.activeHandle;
  const cell = view.state.doc.nodeAt(cellPos);
  if (!cell) return false;

  let startWidth;
  try {
    startWidth = currentColWidth(view, cellPos, cell.attrs);
  } catch {
    return false;
  }

  view.dispatch(
    view.state.tr.setMeta(columnResizingPluginKey, {
      setDragging: { startX: event.clientX, startWidth },
    }),
  );

  const draggedWidth = (moveEvent) =>
    Math.max(cellMinWidth, startWidth + (moveEvent.clientX - event.clientX));

  const finish = (moveEvent) => {
    win.removeEventListener('mouseup', finish);
    win.removeEventListener('mousemove', move);
    if (view.isDestroyed) return;
    try {
      const st = columnResizingPluginKey.getState(view.state);
      if (!st?.dragging) return;
      commitColumnResize(view, st.activeHandle, draggedWidth(moveEvent), cellMinWidth);
    } catch (error) {
      console.warn('[tiptap] table resize finish failed', error);
      try {
        view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null }));
      } catch {
        /* ignore */
      }
    }
  };

  const move = (moveEvent) => {
    if (!moveEvent.which) {
      finish(moveEvent);
      return;
    }
    if (view.isDestroyed) return;
    try {
      const st = columnResizingPluginKey.getState(view.state);
      if (!st?.dragging) return;
      previewColumnResize(view, st.activeHandle, draggedWidth(moveEvent), cellMinWidth);
    } catch {
      /* ignore — never let a map throw kill the renderer */
    }
  };

  try {
    previewColumnResize(view, cellPos, startWidth, cellMinWidth);
  } catch {
    /* ignore */
  }

  win.addEventListener('mouseup', finish);
  win.addEventListener('mousemove', move);
  event.preventDefault();
  return true;
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
 * Drag hint only. Neighbor-absorb used to run in appendTransaction and
 * ping-pong with prosemirror-tables `fixTables` (colwidth mismatch) until
 * the renderer froze — especially after 「표 너비 100%」.
 *
 * @param {number} [cellMinWidth]
 */
export function createFullWidthResizePlugin(cellMinWidth = CELL_MIN_WIDTH) {
  return new Plugin({
    key: fullWidthResizeKey,
    view(editorView) {
      let frame = 0;
      const hint = createResizeHint();
      const onPointerMove = (event) => {
        let pluginState;
        try {
          pluginState = columnResizingPluginKey.getState(editorView.state);
          if (!pluginState?.dragging || pluginState.activeHandle < 0) {
            hideResizeHint(hint);
            return;
          }
        } catch {
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
          try {
            const $cell = editorView.state.doc.resolve(pluginState.activeHandle);
            const sizes = computeResizeWidths(null, $cell, nextWidth, cellMinWidth, editorView);
            if (!sizes) {
              hideResizeHint(hint);
              return;
            }
            showResizeHint(hint, point, sizes);
          } catch {
            hideResizeHint(hint);
          }
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
  });
}
