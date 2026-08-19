export const CELL_MIN_WIDTH = 80;

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
 * @param {import('@tiptap/pm/model').Node} table
 */
export function tableColumnCount(table) {
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
  const floor = Math.max(min, Math.floor(target / count));
  const sum = widths.reduce((total, width) => total + width, 0);
  if (sum <= 0 || target <= 0) {
    return widths.map(() => floor);
  }

  const next = widths.map((width) => Math.max(min, Math.round((width / sum) * target)));
  const drift = target - next.reduce((total, width) => total + width, 0);
  if (drift !== 0) {
    next[next.length - 1] = Math.max(min, next[next.length - 1] + drift);
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
  const base = Math.max(min, Math.floor(target / count));
  const next = Array.from({ length: count }, () => base);
  const drift = target - base * count;
  if (drift !== 0) {
    next[next.length - 1] = Math.max(min, next[next.length - 1] + drift);
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
  const firstRow = table.firstChild;
  if (!firstRow) return widths.map(() => fallback);

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

  return widths.map((width) => (width && width > 0 ? width : fallback));
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {number} tablePos
 */
function measureWrapperWidth(editor, tablePos) {
  const dom = editor.view.nodeDOM(tablePos);
  if (dom instanceof HTMLElement) {
    const wrapper = dom.classList.contains('tableWrapper') ? dom : dom.closest('.tableWrapper');
    if (wrapper instanceof HTMLElement && wrapper.clientWidth > 0) {
      return wrapper.clientWidth;
    }
  }
  return Math.max(editor.view.dom.clientWidth || 0, CELL_MIN_WIDTH * 2);
}

/**
 * Horizontal padding + border inside a cell. Nested tables fill the content box.
 * @param {import('@tiptap/core').Editor} editor
 * @param {number} cellPos
 */
function cellBoxInsets(editor, cellPos, { includeBorder = false } = {}) {
  const dom = editor.view.nodeDOM(cellPos);
  if (!(dom instanceof HTMLElement)) return includeBorder ? 20 : 16;
  const style = getComputedStyle(dom);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  if (!includeBorder) return padding;
  return (
    padding +
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0)
  );
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
    const name = $pos.node(depth).type.name;
    if (name === 'tableCell' || name === 'tableHeader') {
      return { node: $pos.node(depth), pos: $pos.before(depth) };
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
  let found = -1;
  table.forEach((row, rowOffset) => {
    if (found >= 0) return;
    const rowPos = tablePos + 1 + rowOffset;
    let col = 0;
    row.forEach((cell, cellOffset) => {
      if (rowPos + 1 + cellOffset === cellPos) found = col;
      col += Math.max(1, Number(cell.attrs.colspan) || 1);
    });
  });
  return found;
}

/**
 * Editor width for top-level tables; parent cell content width for nested ones.
 * @param {import('@tiptap/core').Editor} editor
 * @param {number} tablePos
 */
export function measureTableTargetWidth(editor, tablePos) {
  const cell = parentCellAt(editor.state.doc, tablePos);
  if (cell) {
    const dom = editor.view.nodeDOM(cell.pos);
    if (dom instanceof HTMLElement && dom.clientWidth > 0) {
      const inner = Math.round(dom.clientWidth - cellBoxInsets(editor, cell.pos));
      if (inner > 0) return Math.max(CELL_MIN_WIDTH, inner);
    }
  }
  return measureWrapperWidth(editor, tablePos);
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
 * Move width between a dragged column and its neighbor so the table sum stays
 * the same (Word-style 100% tables). Last column uses the previous neighbor.
 * @param {number[]} widths
 * @param {number} col
 * @param {number} nextWidth
 * @param {number} [min]
 */
export function redistributeFullWidthColumns(widths, col, nextWidth, min = CELL_MIN_WIDTH) {
  const next = widths.slice();
  if (col < 0 || col >= next.length) return next;
  const neighbor = col < next.length - 1 ? col + 1 : col > 0 ? col - 1 : -1;
  const desired = Math.max(min, Math.round(nextWidth));
  if (neighbor < 0) {
    next[col] = desired;
    return next;
  }
  const delta = desired - next[col];
  const neighborNext = next[neighbor] - delta;
  if (neighborNext < min) {
    next[col] = Math.max(min, next[col] + (next[neighbor] - min));
    next[neighbor] = min;
    return next;
  }
  next[col] = desired;
  next[neighbor] = neighborNext;
  return next;
}

/**
 * @param {import('@tiptap/pm/state').Transaction} tr
 * @param {number} tablePos
 * @param {import('@tiptap/pm/model').Node} table
 * @param {number[]} widths
 * @param {{ fullWidth?: boolean }} [options]
 */
export function writeTableColumnWidths(tr, tablePos, table, widths, options) {
  if (!table || widths.length === 0) return false;
  let changed = false;

  table.forEach((row, rowOffset) => {
    const rowPos = tablePos + 1 + rowOffset;
    let col = 0;
    row.forEach((cell, cellOffset) => {
      const span = Math.max(1, Number(cell.attrs.colspan) || 1);
      const next = widths.slice(col, col + span);
      while (next.length < span) next.push(widths[widths.length - 1] ?? CELL_MIN_WIDTH);
      const prev = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : null;
      const same =
        prev &&
        prev.length === next.length &&
        next.every((width, index) => prev[index] === width);
      if (!same) {
        tr.setNodeMarkup(rowPos + 1 + cellOffset, undefined, {
          ...cell.attrs,
          colwidth: next,
        });
        changed = true;
      }
      col += span;
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
 * @param {number[]} widths
 * @param {{ fullWidth?: boolean }} [options]
 */
function applyColumnWidths(editor, widths, options) {
  const found = findTableNearSelection(editor.state);
  if (!found || widths.length === 0) return false;

  const { tr } = editor.state;
  const changed = writeTableColumnWidths(tr, found.pos, found.node, widths, options);
  if (!changed) return true;
  editor.view.dispatch(tr);
  return true;
}

/**
 * Stretch the current table to the editor content width, keeping column ratios.
 * @param {import('@tiptap/core').Editor} editor
 */
export function fitTableToFullWidth(editor) {
  const found = findTableNearSelection(editor.state);
  if (!found) return false;
  const colCount = tableColumnCount(found.node);
  if (colCount <= 0) return false;
  const current = readColumnWidths(found.node, colCount);
  const target = measureTableTargetWidth(editor, found.pos);
  return applyColumnWidths(editor, scaleColumnWidths(current, target), { fullWidth: true });
}

/**
 * Stretch every table to 100% of its container. Top-level tables use the
 * editor width; nested tables use the parent cell after the outer table is
 * scaled, so one undo step covers the whole document.
 * @param {import('@tiptap/core').Editor} editor
 */
export function fitAllTablesToFullWidth(editor) {
  const collected = collectDocumentTables(editor.state.doc);
  if (collected.length === 0) return false;

  collected.sort((left, right) => left.depth - right.depth || left.pos - right.pos);

  const { tr } = editor.state;
  /** @type {Map<number, number[]>} */
  const fittedWidths = new Map();
  let changed = false;

  for (const item of collected) {
    const table = tr.doc.nodeAt(item.pos);
    if (!isTableNode(table)) continue;
    const colCount = tableColumnCount(table);
    if (colCount <= 0) continue;

    const parent = parentCellAt(tr.doc, item.pos);
    const parentTablePos = parent ? ancestorTablePos(tr.doc, parent.pos) : null;
    const parentWidths = parentTablePos != null ? fittedWidths.get(parentTablePos) : null;
    const parentTable = parentTablePos != null ? tr.doc.nodeAt(parentTablePos) : null;

    let target = measureTableTargetWidth(editor, item.pos);
    if (parent && parentTable && isTableNode(parentTable) && parentWidths) {
      const col = columnIndexOfCell(parentTable, parentTablePos, parent.pos);
      const span = Math.max(1, Number(parent.node.attrs.colspan) || 1);
      if (col >= 0) {
        const cellWidth = parentWidths
          .slice(col, col + span)
          .reduce((total, width) => total + width, 0);
        if (cellWidth > 0) {
          target = Math.max(
            CELL_MIN_WIDTH,
            Math.round(cellWidth - cellBoxInsets(editor, parent.pos, { includeBorder: true })),
          );
        }
      }
    }

    const widths = scaleColumnWidths(readColumnWidths(table, colCount), target);
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
 * Make every column the same width. Uses the current table pixel width when
 * columns already have sizes; otherwise fills the editor width.
 * @param {import('@tiptap/core').Editor} editor
 */
export function equalizeTableColumns(editor) {
  const found = findTableNearSelection(editor.state);
  if (!found) return false;
  const colCount = tableColumnCount(found.node);
  if (colCount <= 0) return false;
  const current = readColumnWidths(found.node, colCount);
  const hasExplicit = found.node.firstChild
    ? (() => {
        let explicit = false;
        found.node.firstChild.forEach((cell) => {
          if (Array.isArray(cell.attrs.colwidth) && cell.attrs.colwidth.some((width) => Number(width) > 0)) {
            explicit = true;
          }
        });
        return explicit;
      })()
    : false;
  const target = hasExplicit
    ? current.reduce((total, width) => total + width, 0)
    : measureWrapperWidth(editor, found.pos);
  return applyColumnWidths(editor, equalColumnWidths(colCount, target));
}
