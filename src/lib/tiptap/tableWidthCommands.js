const CELL_MIN_WIDTH = 80;

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
function readColumnWidths(table, colCount, fallback = CELL_MIN_WIDTH) {
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
 * @param {import('@tiptap/core').Editor} editor
 * @param {number[]} widths
 */
function applyColumnWidths(editor, widths) {
  const found = findTableNearSelection(editor.state);
  if (!found || widths.length === 0) return false;

  const { tr } = editor.state;
  let changed = false;

  found.node.forEach((row, rowOffset) => {
    const rowPos = found.pos + 1 + rowOffset;
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
  const target = measureWrapperWidth(editor, found.pos);
  return applyColumnWidths(editor, scaleColumnWidths(current, target));
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
