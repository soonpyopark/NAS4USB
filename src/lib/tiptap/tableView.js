import { CELL_MIN_WIDTH, isTableNode, readColumnWidths, tableColumnCount } from './tableWidthCommands.js';

/**
 * Apply col widths for `table-layout: fixed` + `width: 100%`.
 * The last column is left unsized (`auto`) so it absorbs leftover space and
 * the table never grows past its container.
 *
 * @param {import('@tiptap/pm/model').Node} node
 * @param {HTMLElement} colgroup
 * @param {HTMLTableElement} table
 * @param {number} [overrideCol]
 * @param {number | null} [overrideValue]
 */
export function updateColumnsLeavingLastAuto(
  node,
  colgroup,
  table,
  overrideCol = undefined,
  overrideValue = undefined,
) {
  let nextDOM = colgroup.firstChild;
  const colCount = tableColumnCount(node);
  const last = colCount - 1;
  const widths = readColumnWidths(node, colCount, CELL_MIN_WIDTH);

  for (let col = 0; col < colCount; col += 1) {
    const isLast = col === last;
    const raw = overrideCol === col ? overrideValue : widths[col];
    const hasWidth = !isLast && Number(raw) > 0 ? Number(raw) : null;
    if (!nextDOM) {
      const colEl = document.createElement('col');
      applyColStyle(colEl, hasWidth);
      colgroup.appendChild(colEl);
      nextDOM = null;
    } else {
      applyColStyle(nextDOM, hasWidth);
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
 */
function applyColStyle(colEl, width) {
  colEl.style.minWidth = '';
  colEl.removeAttribute('width');
  if (width && width > 0) {
    colEl.style.width = `${width}px`;
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
    updateColumnsLeavingLastAuto(node, this.colgroup, this.table);
    this.contentDOM = this.table.appendChild(document.createElement('tbody'));
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
    updateColumnsLeavingLastAuto(node, this.colgroup, this.table);
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
