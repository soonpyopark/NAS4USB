import { findHighlightRanges, parseDocSearchQuery } from '../../shared/docSearchQuery.js';

const HIT_CLASS = 'nas-search-hit';
const HIT_ACTIVE_CLASS = 'nas-search-hit--active';
const STYLE_MARK = 'data-nas-search-hit';
const HIT_STYLE = `mark.${HIT_CLASS}{background:#fde68a;color:inherit;border-radius:2px;padding:0 .05em}mark.${HIT_ACTIVE_CLASS}{background:#f59e0b;box-shadow:0 0 0 1px #d97706}`;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeHighlightQuery(value) {
  return String(value ?? '').trim();
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape text and wrap case-insensitive matches in <mark>.
 * @param {unknown} text
 * @param {unknown} query
 */
export function highlightPlainTextToHtml(text, query) {
  const source = String(text ?? '');
  const needle = normalizeHighlightQuery(query);
  if (!needle) return escapeHtml(source);

  const ranges = findHighlightRanges(source, needle);
  if (!ranges.length) return escapeHtml(source);

  let html = '';
  let cursor = 0;
  let first = true;
  for (const range of ranges) {
    html += escapeHtml(source.slice(cursor, range.from));
    const cls = first ? `${HIT_CLASS} ${HIT_ACTIVE_CLASS}` : HIT_CLASS;
    html += `<mark class="${cls}">${escapeHtml(source.slice(range.from, range.to))}</mark>`;
    first = false;
    cursor = range.to;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
}

/**
 * @param {object | null | undefined} entry
 * @param {unknown} query
 */
export function withHighlightQuery(entry, query) {
  if (!entry) return entry;
  const highlightQuery = normalizeHighlightQuery(query);
  if (!highlightQuery) {
    if (!entry.highlightQuery) return entry;
    const next = { ...entry };
    delete next.highlightQuery;
    return next;
  }
  if (entry.highlightQuery === highlightQuery) return entry;
  return { ...entry, highlightQuery };
}

/**
 * @param {ParentNode | null | undefined} root
 */
export function clearSearchHighlights(root) {
  if (!root?.querySelectorAll) return;
  for (const mark of [...root.querySelectorAll(`mark.${HIT_CLASS}`)]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize?.();
  }
}

/**
 * @param {Document | null | undefined} doc
 */
function ensureHighlightStyle(doc) {
  if (!doc?.documentElement) return;
  if (doc.querySelector(`style[${STYLE_MARK}]`)) return;
  const el = doc.createElement('style');
  el.setAttribute(STYLE_MARK, '');
  el.textContent = HIT_STYLE;
  (doc.head || doc.documentElement).appendChild(el);
}

/**
 * Wrap case-insensitive matches in `root`. Scrolls the first hit into view.
 * @param {ParentNode | null | undefined} root
 * @param {unknown} query
 * @returns {number}
 */
export function highlightTextInElement(root, query) {
  clearSearchHighlights(root);
  const needle = normalizeHighlightQuery(query);
  if (!root || !needle) return 0;

  const doc = /** @type {Document | null} */ (
    root.nodeType === 9 ? root : root.ownerDocument
  );
  if (!doc) return 0;
  ensureHighlightStyle(doc);

  const ast = parseDocSearchQuery(needle);
  if (!ast) return 0;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.nodeValue;
      if (!value || !value.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent?.closest?.(`script, style, textarea, mark.${HIT_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  /** @type {Text[]} */
  const nodes = [];
  while (walker.nextNode()) nodes.push(/** @type {Text} */ (walker.currentNode));

  let count = 0;
  /** @type {HTMLElement | null} */
  let first = null;

  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const ranges = findHighlightRanges(text, ast);
    if (!ranges.length) continue;

    const frag = doc.createDocumentFragment();
    let cursor = 0;
    for (const range of ranges) {
      if (range.from > cursor) frag.append(text.slice(cursor, range.from));
      const mark = doc.createElement('mark');
      mark.className = first ? HIT_CLASS : `${HIT_CLASS} ${HIT_ACTIVE_CLASS}`;
      mark.textContent = text.slice(range.from, range.to);
      if (!first) first = mark;
      frag.append(mark);
      count += 1;
      cursor = range.to;
    }
    if (cursor < text.length) frag.append(text.slice(cursor));
    node.parentNode?.replaceChild(frag, node);
  }

  first?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  return count;
}
