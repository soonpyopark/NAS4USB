import { TableMap } from '@tiptap/pm/tables';

export const CELL_MIN_WIDTH = 80;

/**
 * Fallback when the editor DOM is not measurable. Live 100% uses the content box.
 */
export const FULL_WIDTH_TABLE_PX = 1000;

/**
 * Horizontal cell padding from `.tiptap-table td/th` (`0.6rem` × 2 at 12pt = 16px).
 * Cells are `box-sizing: border-box`, so nested tables subtract padding only.
 */
export const CELL_PADDING_X = 19;

/** Skip neighbor-absorb in the full-width resize plugin (programmatic 100% / equalize). */
export const SKIP_FULL_WIDTH_ABSORB_META = 'nas4usbSkipFullWidthAbsorb';

/**
 * Floor per column so `min * count` cannot exceed `budget`.
 * @param {number} count
 * @param {number} budget
 * @param {number} [min]
 */
export function minWidthForBudget(count, budget, min = CELL_MIN_WIDTH) {
  if (count <= 0) return min;
  if (min * count <= budget) return min;
  return Math.max(1, Math.floor(budget / count));
}

/**
 * @param {import('@tiptap/pm/model').Node | null | undefined} node
 */
export function isTableNode(node) {
  return Boolean(node && (node.type.name === 'table' || node.type.spec.tableRole === 'table'));
}

/**
 * @param {import('@tiptap/pm/state').EditorState} state
 * @returns {{ node: import('@tiptap/pm/model').Node, pos: number } | null}
 */
export function findTableNearSelection(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table' || node.type.spec.tableRole === 'table') {
      return { node, pos: $from.before(depth) };
    }
  }
  return null;
}

/**
 * Outermost table around the caret — 「표 너비 100%」 / 「열 너비 균등」.
 */
export function findOutermostTableNearSelection(state) {
  const { $from } = state.selection;
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table' || node.type.spec.tableRole === 'table') {
      return { node, pos: $from.before(depth) };
    }
  }
  return null;
}

/**
 * @param {import('@tiptap/pm/model').Node} table
 * @returns {import('@tiptap/pm/tables').TableMap | null}
 */
export function tableMapOrNull(table) {
  if (!isTableNode(table)) return null;
  try {
    return TableMap.get(table);
  } catch {
    return null;
  }
}

/**
 * @param {import('@tiptap/pm/model').Node} row
 */
function columnCountOfRow(row) {
  let count = 0;
  row.forEach((cell) => {
    count += Math.max(1, Number(cell.attrs.colspan) || 1);
  });
  return count;
}

/**
 * True column count, including columns occupied only by rowspan cells.
 *
 * @param {import('@tiptap/pm/model').Node} table
 */
export function tableColumnCount(table) {
  const map = tableMapOrNull(table);
  if (map) return map.width;
  let max = 0;
  table.forEach((row) => {
    max = Math.max(max, columnCountOfRow(row));
  });
  return max;
}

/**
 * @param {number[]} widths
 * @param {number} target
 * @param {number} [min]
 */
export function scaleColumnWidths(widths, target, min = CELL_MIN_WIDTH) {
  const count = widths.length;
  if (count === 0) return [];
  const minUsed = minWidthForBudget(count, target, min);
  const floor = Math.max(minUsed, Math.floor(target / count));
  const sum = widths.reduce((total, width) => total + width, 0);
  if (sum <= 0 || target <= 0) {
    return widths.map(() => floor);
  }

  const next = widths.map((width) => Math.max(minUsed, Math.round((width / sum) * target)));
  const drift = target - next.reduce((total, width) => total + width, 0);
  if (drift !== 0) {
    next[next.length - 1] = Math.max(minUsed, next[next.length - 1] + drift);
  }
  return next;
}

/**
 * @param {number} count
 * @param {number} target
 * @param {number} [min]
 */
export function equalColumnWidths(count, target, min = CELL_MIN_WIDTH) {
  if (count <= 0) return [];
  const minUsed = minWidthForBudget(count, target, min);
  const base = Math.max(minUsed, Math.floor(target / count));
  const next = Array.from({ length: count }, () => base);
  const drift = target - base * count;
  if (drift !== 0) {
    next[next.length - 1] = Math.max(minUsed, next[next.length - 1] + drift);
  }
  return next;
}

/**
 * @param {import('@tiptap/pm/model').Node} table
 * @param {number} colCount
 * @param {number} [fallback]
 */
export function readColumnWidths(table, colCount, fallback = CELL_MIN_WIDTH) {
  /** @type {Array<number | null>} */
  const widths = Array.from({ length: colCount }, () => null);
  const map = tableMapOrNull(table);
  if (map) {
    const seen = new Set();
    for (let col = 0; col < map.width && col < colCount; col += 1) {
      const pos = map.map[col];
      if (seen.has(pos)) continue;
      seen.add(pos);
      const cell = table.nodeAt(pos);
      if (!cell) continue;
      const span = Math.max(1, Number(cell.attrs.colspan) || 1);
      const colwidth = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : null;
      for (let index = 0; index < span && col + index < colCount; index += 1) {
        const value = Number(colwidth?.[index] ?? colwidth?.[0]);
        if (Number.isFinite(value) && value > 0) {
          widths[col + index] = value;
        }
      }
    }
  } else {
    const firstRow = table.firstChild;
    if (!firstRow) {
      return widths.map((_, index) => (index === colCount - 1 ? null : fallback));
    }
    let col = 0;
    firstRow.forEach((cell) => {
      const span = Math.max(1, Number(cell.attrs.colspan) || 1);
      const colwidth = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : null;
      for (let index = 0; index < span && col + index < colCount; index += 1) {
        const value = Number(colwidth?.[index] ?? colwidth?.[0]);
        if (Number.isFinite(value) && value > 0) {
          widths[col + index] = value;
        }
      }
      col += span;
    });
  }

  const last = colCount - 1;
  return widths.map((width, index) => {
    if (index === last) return width && width > 0 ? width : null;
    return width && width > 0 ? width : fallback;
  });
}

/**
 * Last column stays unsized (`auto`) so `width: 100%` + `table-layout: fixed`
 * can absorb leftover space. Explicit columns are capped so they plus one
 * minimum last column cannot exceed `budget`.
 *
 * @param {Array<number | null | undefined>} widths
 * @param {number} budget
 * @param {number} [min]
 * @returns {Array<number | null>}
 */
export function withLastColumnAuto(widths, budget, min = CELL_MIN_WIDTH) {
  const count = widths.length;
  if (count === 0) return [];
  if (count === 1) return [null];
  const minUsed = minWidthForBudget(count, budget, min);
  const numeric = widths.map((width) => {
    const value = Number(width);
    return Number.isFinite(value) && value > 0 ? value : minUsed;
  });
  const scaled = scaleColumnWidths(numeric, budget, minUsed);
  scaled[count - 1] = null;
  return capExplicitColumns(scaled, budget, minUsed);
}

/**
 * @param {Array<number | null>} widths  last entry is null
 * @param {number} budget
 * @param {number} min
 * @returns {Array<number | null>}
 */
export function capExplicitColumns(widths, budget, min = CELL_MIN_WIDTH) {
  const last = widths.length - 1;
  if (last < 0) return [];
  const minUsed = minWidthForBudget(widths.length, budget, min);
  /** @type {Array<number | null>} */
  const next = widths.map((width, index) => (index === last ? null : width));
  if (last === 0) return next;

  let sum = 0;
  for (let index = 0; index < last; index += 1) {
    const value = Number(next[index]);
    if (Number.isFinite(value) && value > 0) {
      next[index] = Math.max(minUsed, Math.round(value));
    } else {
      next[index] = minUsed;
    }
    sum += next[index];
  }

  const maxSum = Math.max(minUsed, budget - minUsed);
  if (sum <= maxSum) return next;

  const scale = maxSum / sum;
  let used = 0;
  for (let index = 0; index < last; index += 1) {
    next[index] = Math.max(minUsed, Math.round(Number(next[index]) * scale));
    used += next[index];
  }
  const drift = maxSum - used;
  if (drift !== 0 && last > 0) {
    next[last - 1] = Math.max(minUsed, Number(next[last - 1]) + drift);
  }
  return next;
}

/**
 * Equal px on every column except the last, which stays `auto`.
 *
 * @param {number} count
 * @param {number} budget
 * @param {number} [min]
 * @returns {Array<number | null>}
 */
export function equalColumnWidthsLeavingLastAuto(count, budget, min = CELL_MIN_WIDTH) {
  if (count <= 0) return [];
  if (count === 1) return [null];
  const minUsed = minWidthForBudget(count, budget, min);
  const share = Math.max(minUsed, Math.floor(budget / count));
  const next = Array.from({ length: count }, (_, index) => (index === count - 1 ? null : share));
  return capExplicitColumns(next, budget, minUsed);
}

/**
 * Drag one non-last column; last column stays auto. Explicit columns never
 * consume more than `budget - min(last)`.
 *
 * @param {Array<number | null>} widths
 * @param {number} col
 * @param {number} nextWidth
 * @param {number} budget
 * @param {number} [min]
 * @returns {Array<number | null>}
 */
export function resizeColumnLeavingLastAuto(widths, col, nextWidth, budget, min = CELL_MIN_WIDTH) {
  const count = widths.length;
  const last = count - 1;
  if (count === 0) return [];
  const minUsed = minWidthForBudget(count, budget, min);
  if (col < 0 || col >= last) {
    return withLastColumnAuto(widths, budget, minUsed);
  }

  let other = 0;
  for (let index = 0; index < last; index += 1) {
    if (index === col) continue;
    const value = Number(widths[index]);
    other += Number.isFinite(value) && value > 0 ? value : minUsed;
  }
  const maxCol = Math.max(minUsed, budget - other - minUsed);
  const desired = Math.min(maxCol, Math.max(minUsed, Math.round(nextWidth)));
  const next = widths.map((width, index) => {
    if (index === last) return null;
    if (index === col) return desired;
    const value = Number(width);
    return Number.isFinite(value) && value > 0 ? value : minUsed;
  });
  return capExplicitColumns(next, budget, minUsed);
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {number} pos
 */
function ancestorTablePos(doc, pos) {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isTableNode($pos.node(depth))) return $pos.before(depth);
  }
  return null;
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {number} tablePos
 */
function parentCellAt(doc, tablePos) {
  const $pos = doc.resolve(tablePos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const role = node.type.spec.tableRole;
    if (
      role === 'cell' ||
      role === 'header_cell' ||
      node.type.name === 'tableCell' ||
      node.type.name === 'tableHeader'
    ) {
      return { node, pos: $pos.before(depth) };
    }
  }
  return null;
}

/**
 * @param {import('@tiptap/pm/model').Node} table
 * @param {number} tablePos
 * @param {number} cellPos
 */
function columnIndexOfCell(table, tablePos, cellPos) {
  const map = tableMapOrNull(table);
  if (map) {
    try {
      return map.colCount(cellPos - (tablePos + 1));
    } catch {
      return -1;
    }
  }
  let found = -1;
  table.forEach((row, rowOffset) => {
    if (found >= 0) return;
    const rowPos = tablePos + 1 + rowOffset;
    let col = 0;
    row.forEach((cell, cellOffset) => {
      const pos = rowPos + 1 + cellOffset;
      if (cellPos === pos || (cellPos > pos && cellPos < pos + cell.nodeSize)) {
        found = col;
      }
      col += Math.max(1, Number(cell.attrs.colspan) || 1);
    });
  });
  return found;
}

/**
 * TipTap body content width (padding excluded). 「표 너비 100%」 / outer equalize cap.
 *
 * @param {import('@tiptap/pm/view').EditorView | null | undefined} view
 */
export function editorContentBoxWidth(view) {
  const el = view?.dom;
  if (!(el instanceof HTMLElement) || el.clientWidth <= 0) return FULL_WIDTH_TABLE_PX;
  const style = getComputedStyle(el);
  const pad =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const inner = Math.floor(el.clientWidth - pad) - 1;
  return Math.max(CELL_MIN_WIDTH, inner);
}

/**
 * Outermost table 100% budget = editor body width.
 *
 * @param {import('@tiptap/pm/view').EditorView | null | undefined} view
 */
export function topLevelTableBudget(view) {
  return editorContentBoxWidth(view);
}

function parentCellContentWidth(view, cellPos) {
  if (!view) return null;
  let dom = view.nodeDOM(cellPos);
  if (dom instanceof Text) dom = dom.parentElement;
  if (!(dom instanceof HTMLElement)) return null;
  const cell =
    dom.tagName === 'TD' || dom.tagName === 'TH' ? dom : dom.closest('td, th');
  if (!(cell instanceof HTMLElement) || cell.clientWidth <= 0) return null;
  const style = getComputedStyle(cell);
  const pad =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(1, Math.floor(cell.clientWidth - pad));
}

/**
 * Live 100% target: the table's own wrapper (outer = editor, nested = parent cell).
 * Wrappers are `overflow-x: hidden; width: 100%`, so this is not the old inflation path.
 *
 * @param {import('@tiptap/pm/view').EditorView | null | undefined} view
 * @param {number} tablePos
 * @returns {number | null}
 */
export function measureTablePaneWidth(view, tablePos) {
  if (!view) return null;
  const nodeDom = view.nodeDOM(tablePos);
  if (nodeDom instanceof HTMLElement && nodeDom.classList.contains('tableWrapper')) {
    if (nodeDom.clientWidth > 0) return nodeDom.clientWidth;
  }
  /** @type {HTMLTableElement | null} */
  let tableEl = null;
  if (nodeDom instanceof HTMLTableElement) tableEl = nodeDom;
  else if (nodeDom instanceof HTMLElement) {
    const direct = nodeDom.querySelector(':scope > table');
    if (direct instanceof HTMLTableElement) tableEl = direct;
  }
  if (!tableEl) {
    try {
      const at = view.domAtPos(tablePos + 1);
      let node = at.node;
      if (node instanceof Text) node = node.parentElement;
      while (node && /** @type {Node} */ (node).nodeName !== 'TABLE') {
        node = /** @type {Node | null} */ (node.parentNode);
      }
      if (node instanceof HTMLTableElement) tableEl = node;
    } catch {
      tableEl = null;
    }
  }
  if (!tableEl) return null;
  const wrapper = tableEl.parentElement;
  if (wrapper instanceof HTMLElement && wrapper.classList.contains('tableWrapper') && wrapper.clientWidth > 0) {
    return wrapper.clientWidth;
  }
  const td = tableEl.closest('td, th');
  if (td instanceof HTMLElement && td.clientWidth > 0) {
    const style = getComputedStyle(td);
    const pad =
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    return Math.max(1, Math.floor(td.clientWidth - pad));
  }
  return tableEl.clientWidth > 0 ? tableEl.clientWidth : null;
}

/**
 * Nested table fills the parent column content box (colwidth minus cell padding).
 * @param {number[]} parentWidths
 * @param {number} col
 * @param {number} span
 */
export function nestedTableInnerWidth(parentWidths, col, span) {
  const slice = parentWidths.slice(col, col + span);
  if (slice.some((width) => !(Number(width) > 0))) return 0;
  const cellWidth = slice.reduce((total, width) => total + Number(width), 0);
  return Math.max(1, Math.round(cellWidth - CELL_PADDING_X));
}

/**
 * Pixel budget for a table.
 * Outermost: wrapper / editor content box. Nested: parent cell / nested wrapper.
 * Nested tables never fall back to the editor body width.
 *
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {number} tablePos
 * @param {Map<number, number[]> | null} [fittedWidths]
 * @param {import('@tiptap/pm/view').EditorView | null} [view]
 */
export function tableWidthBudget(doc, tablePos, fittedWidths = null, view = null) {
  const pane = measureTablePaneWidth(view, tablePos);
  const cell = parentCellAt(doc, tablePos);
  if (cell) {
    if (pane != null && pane > 0) return pane;
    const fromDom = parentCellContentWidth(view, cell.pos);
    const parentTablePos = ancestorTablePos(doc, cell.pos);
    const parentTable = parentTablePos != null ? doc.nodeAt(parentTablePos) : null;
    if (parentTablePos != null && isTableNode(parentTable)) {
      const colCount = tableColumnCount(parentTable);
      const widths = fittedWidths?.get(parentTablePos) ?? readColumnWidths(parentTable, colCount);
      const col = columnIndexOfCell(parentTable, parentTablePos, cell.pos);
      const span = Math.max(1, Number(cell.node.attrs.colspan) || 1);
      if (col >= 0) {
        const inner = nestedTableInnerWidth(widths, col, span);
        if (inner > 0) return inner;
      }
    }
    if (fromDom != null) return fromDom;
    return Math.max(CELL_MIN_WIDTH, pane ?? 0) || CELL_MIN_WIDTH;
  }
  return pane ?? topLevelTableBudget(view);
}

/**
 * @param {import('@tiptap/pm/model').Node} doc
 * @returns {Array<{ node: import('@tiptap/pm/model').Node, pos: number, depth: number }>}
 */
export function collectDocumentTables(doc) {
  /** @type {Array<{ node: import('@tiptap/pm/model').Node, pos: number, depth: number }>} */
  const tables = [];
  doc.descendants((node, pos) => {
    if (!isTableNode(node)) return;
    const $pos = doc.resolve(pos);
    let depth = 0;
    for (let level = $pos.depth; level > 0; level -= 1) {
      if (isTableNode($pos.node(level))) depth += 1;
    }
    tables.push({ node, pos, depth });
  });
  return tables;
}

/**
 * Dragged column keeps `nextWidth`; the rightmost column absorbs the delta so
 * the table sum does not change. If the dragged column is the last, the
 * previous column absorbs (last-column right handle is disabled).
 * @param {number[]} widths
 * @param {number} col
 * @param {number} nextWidth
 * @param {number} [min]
 */
export function redistributeFullWidthColumns(widths, col, nextWidth, min = CELL_MIN_WIDTH) {
  const next = widths.slice();
  if (col < 0 || col >= next.length) return next;
  const last = next.length - 1;
  const absorber = col === last ? (col > 0 ? col - 1 : -1) : last;
  const desired = Math.max(min, Math.round(nextWidth));
  if (absorber < 0) {
    next[col] = desired;
    return next;
  }
  const delta = desired - next[col];
  const absorberNext = next[absorber] - delta;
  if (absorberNext < min) {
    next[col] = Math.max(min, next[col] + (next[absorber] - min));
    next[absorber] = min;
    return next;
  }
  next[col] = desired;
  next[absorber] = absorberNext;
  return next;
}

function normalizeColwidthSlice(slice, span) {
  const next = slice.slice(0, span);
  while (next.length < span) next.push(null);
  const values = next.map((width) => {
    const value = Number(width);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  });
  if (values.every((width) => width == null)) return null;
  return values;
}

function colwidthUnchanged(prev, next) {
  if (prev == null && next == null) return true;
  if (!prev || !next || prev.length !== next.length) return false;
  return next.every((width, index) => prev[index] === width);
}

/**
 * Last column is stored without `colwidth` so CSS can size it as `auto`.
 *
 * @param {import('@tiptap/pm/state').Transaction} tr
 * @param {number} tablePos
 * @param {import('@tiptap/pm/model').Node} table
 * @param {Array<number | null>} widths
 * @param {{ fullWidth?: boolean, lastColumnAuto?: boolean }} [options]
 */
export function writeTableColumnWidths(tr, tablePos, table, widths, options) {
  if (!table || widths.length === 0) return false;
  const lastAuto = options?.lastColumnAuto !== false;
  const nextWidths = lastAuto
    ? widths.map((width, index) => (index === widths.length - 1 ? null : width))
    : widths;
  const map = tableMapOrNull(table);
  const tableStart = tablePos + 1;
  let changed = false;

  table.forEach((row, rowOffset) => {
    const rowPos = tablePos + 1 + rowOffset;
    let naiveCol = 0;
    row.forEach((cell, cellOffset) => {
      const span = Math.max(1, Number(cell.attrs.colspan) || 1);
      const cellPos = rowPos + 1 + cellOffset;
      let col = naiveCol;
      if (map) {
        try {
          col = map.colCount(cellPos - tableStart);
        } catch {
          col = naiveCol;
        }
      }
      const next = normalizeColwidthSlice(nextWidths.slice(col, col + span), span);
      const prev = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : null;
      if (!colwidthUnchanged(prev, next)) {
        tr.setNodeMarkup(cellPos, undefined, {
          ...cell.attrs,
          colwidth: next,
        });
        changed = true;
      }
      naiveCol = col + span;
    });
  });

  if (options?.fullWidth && !table.attrs.fullWidth) {
    tr.setNodeMarkup(tablePos, undefined, { ...table.attrs, fullWidth: true });
    changed = true;
  }

  return changed;
}

/**
 * @param {number[]} left
 * @param {number[]} right
 */
export function singleChangedColumnIndex(left, right) {
  if (left.length !== right.length) return -1;
  let changed = -1;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      if (changed !== -1) return -1;
      changed = index;
    }
  }
  return changed;
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {Array<{ node: import('@tiptap/pm/model').Node, pos: number, depth: number }>} collected
 */
function fitCollectedTables(editor, collected) {
  collected.sort((left, right) => left.depth - right.depth || left.pos - right.pos);
  const { tr } = editor.state;
  tr.setMeta(SKIP_FULL_WIDTH_ABSORB_META, true);
  /** @type {Map<number, number[]>} */
  const fittedWidths = new Map();
  let changed = false;

  for (const item of collected) {
    const table = tr.doc.nodeAt(item.pos);
    if (!isTableNode(table)) continue;
    const colCount = tableColumnCount(table);
    if (colCount <= 0) continue;

    const target = tableWidthBudget(tr.doc, item.pos, fittedWidths, editor.view);
    const widths = withLastColumnAuto(readColumnWidths(table, colCount), target);
    fittedWidths.set(item.pos, widths);
    if (writeTableColumnWidths(tr, item.pos, table, widths, { fullWidth: true })) {
      changed = true;
    }
  }

  if (!changed) return true;
  editor.view.dispatch(tr);
  return true;
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {number[]} widths
 * @param {{ fullWidth?: boolean }} [options]
 */
function applyColumnWidths(editor, found, widths, options) {
  if (!found || widths.length === 0) return false;

  const { tr } = editor.state;
  tr.setMeta(SKIP_FULL_WIDTH_ABSORB_META, true);
  const changed = writeTableColumnWidths(tr, found.pos, found.node, widths, options);
  if (!changed) return true;
  editor.view.dispatch(tr);
  return true;
}

function editorIsUsable(editor) {
  return Boolean(editor && !editor.isDestroyed && editor.view && !editor.view.isDestroyed);
}

/**
 * 「표 너비 100%」: outermost table = TipTap body content width.
 * @param {import('@tiptap/core').Editor} editor
 */
export function fitTableToFullWidth(editor) {
  if (!editorIsUsable(editor)) return false;
  try {
    const found = findOutermostTableNearSelection(editor.state);
    if (!found) return false;
    const colCount = tableColumnCount(found.node);
    if (colCount <= 0) return false;
    const target = editorContentBoxWidth(editor.view);
    const current = readColumnWidths(found.node, colCount);
    return applyColumnWidths(editor, found, withLastColumnAuto(current, target), { fullWidth: true });
  } catch (error) {
    console.warn('[tiptap] fitTableToFullWidth failed', error);
    return false;
  }
}

/**
 * 「모든 표 너비 100%」: outermost tables = body width; nested = parent column.
 * @param {import('@tiptap/core').Editor} editor
 */
export function fitAllTablesToFullWidth(editor) {
  if (!editorIsUsable(editor)) return false;
  try {
    const collected = collectDocumentTables(editor.state.doc);
    if (collected.length === 0) return false;
    return fitCollectedTables(editor, collected);
  } catch (error) {
    console.warn('[tiptap] fitAllTablesToFullWidth failed', error);
    return false;
  }
}

/**
 * 「열 너비 균등」: outermost table only. Non-last columns share the editor
 * content width equally; the last column stays auto so the table stays at 100%.
 * @param {import('@tiptap/core').Editor} editor
 */
export function equalizeTableColumns(editor) {
  if (!editorIsUsable(editor)) return false;
  try {
    const found = findOutermostTableNearSelection(editor.state);
    if (!found) return false;
    const colCount = tableColumnCount(found.node);
    if (colCount <= 0) return false;
    const cap = editorContentBoxWidth(editor.view);
    return applyColumnWidths(
      editor,
      found,
      equalColumnWidthsLeavingLastAuto(colCount, cap),
      { fullWidth: true },
    );
  } catch (error) {
    console.warn('[tiptap] equalizeTableColumns failed', error);
    return false;
  }
}
