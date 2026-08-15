const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Indent TipTap `getHTML()` output for the source editor.
 * @param {string} html
 */
export function formatTiptapHtml(html) {
  const source = String(html ?? '')
    .replace(/>\s+</g, '><')
    .trim();
  if (!source) return '';

  const tokens = source.split(/(<[^>]+>)/).filter(Boolean);
  let indent = 0;
  /** @type {string[]} */
  const lines = [];

  for (const token of tokens) {
    if (token.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      lines.push(`${'  '.repeat(indent)}${token}`);
      continue;
    }
    if (token.startsWith('<')) {
      const name = token.match(/^<\/?([a-zA-Z0-9:-]+)/)?.[1]?.toLowerCase() ?? '';
      const isVoid = VOID_TAGS.has(name) || /\/\s*>$/.test(token);
      lines.push(`${'  '.repeat(indent)}${token}`);
      if (!isVoid) indent += 1;
      continue;
    }
    const text = token.trim();
    if (text) lines.push(`${'  '.repeat(indent)}${text}`);
  }

  return lines.join('\n');
}
