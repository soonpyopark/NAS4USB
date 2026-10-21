import { CELL_MIN_WIDTH, isTableNode, readColumnWidths, tableColumnCount } from './tableWidthCommands.js';

/** Preview only: keep first-column px when at or below this width. */
const PREVIEW_PROTECT_FIRST_COL_MAX_PX = 110;

/**
 * Apply col widths for `table-layout: fixed` + `width: 100%`.
 * The last column is left unsized (`auto`) so it absorbs leftover space and
 * the table never grows past its container.
 *
 * When `fitToContainer` is true (read-only / preview), stored column px are
 * rewritten as percentages of their sum so a narrow pane can shrink the table
 * instead of clipping behind `overflow-x: hidden`.
 *
 * Exception: a narrow first column (≤ PREVIEW_PROTECT_FIRST_COL_MAX_PX) keeps
 * its editor px so label/number columns stay readable; only the remaining
 * non-last columns become percentages of their own sum (+ last-column slot).
 *
 * @param {import('@tiptap/pm/model').Node} node
 * @param {HTMLElement} colgroup
 * @param {HTMLTableElement} table
 * @param {number} [overrideCol]
 * @param {number | null} [overrideValue]
 * @param {{ fitToContainer?: boolean }} [options]
 */
export function updateColumnsLeavingLastAuto(
  node,
  colgroup,
  table,
  overrideCol = undefined,
  overrideValue = undefined,
  options = {},
) {
  let nextDOM = colgroup.firstChild;
  const colCount = tableColumnCount(node);
  const last = colCount - 1;
  const widths = readColumnWidths(node, colCount, CELL_MIN_WIDTH);
  const fitToContainer = Boolean(options.fitToContainer);

  /** @type {Array<number | null>} */
  const resolved = [];
  let sumFixed = 0;
  let fixedCount = 0;
  for (let col = 0; col < colCount; col += 1) {
    const isLast = col === last;
    const raw = overrideCol === col ? overrideValue : widths[col];
    const hasWidth = !isLast && Number(raw) > 0 ? Number(raw) : null;
    resolved.push(hasWidth);
    if (hasWidth) {
      sumFixed += hasWidth;
      fixedCount += 1;
    }
  }

  const firstW = resolved[0];
  const protectFirst =
    fitToContainer &&
    last > 0 &&
    firstW != null &&
    firstW > 0 &&
    firstW <= PREVIEW_PROTECT_FIRST_COL_MAX_PX;

  // Percent base includes one average slot for the trailing auto column.
  // When protecting col 0, that column stays px and is excluded from the %.
  let percentBase = 0;
  if (fitToContainer && sumFixed > 0) {
    if (protectFirst) {
      const sumRest = sumFixed - firstW;
      const restCount = fixedCount - 1;
      if (sumRest > 0) {
        const lastSlot = restCount > 0 ? sumRest / restCount : CELL_MIN_WIDTH;
        percentBase = sumRest + lastSlot;
      }
    } else {
      const lastSlot = fixedCount > 0 ? sumFixed / fixedCount : CELL_MIN_WIDTH;
      percentBase = sumFixed + lastSlot;
    }
  }

  for (let col = 0; col < colCount; col += 1) {
    const hasWidth = resolved[col];
    const colPercentBase = protectFirst && col === 0 ? 0 : percentBase;
    if (!nextDOM) {
      const colEl = document.createElement('col');
      applyColStyle(colEl, hasWidth, colPercentBase);
      colgroup.appendChild(colEl);
      nextDOM = null;
    } else {
      applyColStyle(nextDOM, hasWidth, colPercentBase);
      nextDOM = nextDOM.nextSibling;
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after;
  }

  table.style.width = '';
  table.style.minWidth = '';
  table.removeAttribute('width');
}

/**
 * @param {HTMLElement} colEl
 * @param {number | null} width
 * @param {number} [percentBase] when > 0, write `width` as a % of this total
 */
function applyColStyle(colEl, width, percentBase = 0) {
  colEl.style.minWidth = '';
  colEl.removeAttribute('width');
  if (width && width > 0) {
    if (percentBase > 0) {
      colEl.style.width = `${(width / percentBase) * 100}%`;
    } else {
      colEl.style.width = `${width}px`;
    }
  } else {
    colEl.style.width = '';
  }
}

/**
 * Live preview: only the dragged column gets px; the last column stays auto.
 *
 * @param {HTMLTableElement} tableDom
 * @param {Array<number | null>} widths
 */
export function previewColgroupWidths(tableDom, widths) {
  const colgroup = tableDom.querySelector(':scope > colgroup');
  if (!(colgroup instanceof HTMLElement)) return;
  const cols = colgroup.children;
  const last = widths.length - 1;
  for (let i = 0; i < widths.length && i < cols.length; i += 1) {
    const colEl = cols[i];
    if (!(colEl instanceof HTMLElement)) continue;
    applyColStyle(colEl, i === last ? null : widths[i]);
  }
  tableDom.style.width = '';
  tableDom.style.minWidth = '';
  tableDom.removeAttribute('width');
}

/**
 * HTML render spec: last `<col>` has no width so export/print stay at 100%.
 *
 * @param {import('@tiptap/pm/model').Node} node
 * @returns {[string, ...unknown[]]}
 */
export function createLastAutoColGroupSpec(node) {
  /** @type {Array<[string, Record<string, string>] | [string]>} */
  const cols = [];
  const colCount = tableColumnCount(node);
  if (colCount <= 0) return ['colgroup', ['col']];
  const last = colCount - 1;
  const widths = readColumnWidths(node, colCount, CELL_MIN_WIDTH);
  for (let col = 0; col < colCount; col += 1) {
    const width = col !== last && Number(widths[col]) > 0 ? Number(widths[col]) : null;
    if (width) cols.push(['col', { style: `width: ${width}px` }]);
    else cols.push(['col', {}]);
  }
  return ['colgroup', {}, ...cols];
}

/**
 * TipTap/ProseMirror table node view that never writes a pixel table width.
 * `columnResizing` constructs this as `new View(node, cellMinWidth, view)`.
 */
export class Nas4usbTableView {
  /**
   * @param {import('@tiptap/pm/model').Node} node
   * @param {number} [cellMinWidth]
   * @param {import('@tiptap/pm/view').EditorView} [_view]
   * @param {Record<string, unknown>} [HTMLAttributes]
   */
  constructor(node, cellMinWidth = CELL_MIN_WIDTH, _view, HTMLAttributes = {}) {
    this.node = node;
    this.cellMinWidth = cellMinWidth;
    /** @type {import('@tiptap/pm/view').EditorView | null | undefined} */
    this.view = _view;
    this.dom = document.createElement('div');
    this.dom.className = 'tableWrapper';
    this.table = this.dom.appendChild(document.createElement('table'));
    this.table.className = 'tiptap-table';
    for (const [key, value] of Object.entries(HTMLAttributes)) {
      if (value === undefined || value === null) continue;
      if (key === 'style') this.table.style.cssText = String(value);
      else this.table.setAttribute(key, String(value));
    }
    this.syncTableAttrs(node);
    this.colgroup = this.table.appendChild(document.createElement('colgroup'));
    this.syncColumns();
    this.contentDOM = this.table.appendChild(document.createElement('tbody'));
  }

  /**
   * Read-only / preview: shrink stored editor px into % of the pane.
   * @returns {boolean}
   */
  shouldFitToContainer() {
    return Boolean(this.view && !this.view.editable);
  }

  syncColumns() {
    updateColumnsLeavingLastAuto(this.node, this.colgroup, this.table, undefined, undefined, {
      fitToContainer: this.shouldFitToContainer(),
    });
  }

  /**
   * @param {import('@tiptap/pm/model').Node} node
   */
  syncTableAttrs(node) {
    if (node.attrs.fullWidth) this.table.setAttribute('data-full-width', 'true');
    else this.table.removeAttribute('data-full-width');
    this.table.style.width = '';
    this.table.style.minWidth = '';
  }

  /**
   * @param {import('@tiptap/pm/model').Node} node
   */
  update(node) {
    if (!isTableNode(node) || node.type !== this.node.type) return false;
    this.node = node;
    this.syncTableAttrs(node);
    this.syncColumns();
    return true;
  }

  /**
   * @param {MutationRecord} mutation
   */
  ignoreMutation(mutation) {
    const target = mutation.target;
    if (!(target instanceof Node)) return false;
    const isInsideWrapper = this.dom.contains(target);
    const isInsideContent = this.contentDOM.contains(target);
    if (isInsideWrapper && !isInsideContent) {
      return (
        mutation.type === 'attributes' ||
        mutation.type === 'childList' ||
        mutation.type === 'characterData'
      );
    }
    return false;
  }
}
