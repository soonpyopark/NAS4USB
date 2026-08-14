/**
 * Persist text / highlight colors across backup, Y.js seed, and older mark shapes.
 */

/**
 * @param {string} style
 */
export function colorFromStyleAttribute(style) {
  const match = String(style ?? '').match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return match?.[1]?.trim() || '';
}

/**
 * @param {Record<string, unknown> | null | undefined} attrs
 */
function mergeTextStyleAttrs(attrs) {
  const next = { ...(attrs && typeof attrs === 'object' ? attrs : {}) };
  if (!next.color && typeof next.style === 'string') {
    const fromStyle = colorFromStyleAttribute(next.style);
    if (fromStyle) next.color = fromStyle;
  }
  return next;
}

/**
 * @param {import('@tiptap/core').JSONContent['marks']} marks
 */
function normalizeMarkList(marks) {
  if (!Array.isArray(marks) || marks.length === 0) return marks;

  /** @type {NonNullable<import('@tiptap/core').JSONContent['marks']>} */
  const out = [];
  /** @type {Record<string, unknown> | null} */
  let textStyle = null;

  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    if (mark.type === 'color' && mark.attrs && typeof mark.attrs === 'object') {
      textStyle = { ...mergeTextStyleAttrs(textStyle), ...mergeTextStyleAttrs(mark.attrs) };
      continue;
    }
    if (mark.type === 'textStyle') {
      textStyle = { ...mergeTextStyleAttrs(textStyle), ...mergeTextStyleAttrs(mark.attrs) };
      continue;
    }
    out.push(mark);
  }

  if (textStyle && Object.values(textStyle).some((value) => value != null && value !== '')) {
    out.push({ type: 'textStyle', attrs: textStyle });
  }
  return out;
}

/**
 * Rewrite legacy / incomplete color marks so Color + TextStyle can render them.
 *
 * @param {import('@tiptap/core').JSONContent} doc
 * @returns {import('@tiptap/core').JSONContent}
 */
export function normalizeTiptapTextMarks(doc) {
  const cloned = structuredClone(doc ?? { type: 'doc', content: [] });

  /**
   * @param {import('@tiptap/core').JSONContent} node
   */
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks = normalizeMarkList(node.marks);
    }
    if (node.attrs && typeof node.attrs === 'object' && !node.attrs.color) {
      const fromStyle =
        typeof node.attrs.style === 'string' ? colorFromStyleAttribute(node.attrs.style) : '';
      if (fromStyle) node.attrs = { ...node.attrs, color: fromStyle };
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  }

  walk(cloned);
  return cloned;
}

/**
 * Stable keys for text colors / highlights stored on the document.
 *
 * @param {import('@tiptap/core').JSONContent | null | undefined} node
 * @param {Set<string>} [into]
 */
export function collectTiptapColorKeys(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into;

  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (!mark || typeof mark !== 'object') continue;
      const color = mark.attrs && typeof mark.attrs === 'object' ? mark.attrs.color : null;
      if (typeof color === 'string' && color.trim()) {
        if (mark.type === 'highlight') into.add(`highlight:${color}`);
        else into.add(`text:${color}`);
      }
    }
  }

  if (node.attrs && typeof node.attrs === 'object') {
    const blockColor = node.attrs.color;
    if (typeof blockColor === 'string' && blockColor.trim()) {
      into.add(`block:${blockColor}`);
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) collectTiptapColorKeys(child, into);
  }
  return into;
}
