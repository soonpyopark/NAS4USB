/**
 * Strip TipTap editor wrappers so pandoc sees bare block content (`<p>`, `<table>`, …).
 * `.tableWrapper` and chrome `<div>`s become Div in the pandoc AST; pypandoc-hwpx then
 * drops nested tables (and often the whole Div subtree).
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeTiptapHtmlForHwpx(html) {
  let out = String(html ?? '');

  const bodyMatch = out.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) out = bodyMatch[1];

  const proseInner = extractProseMirrorInner(out);
  if (proseInner != null) {
    out = proseInner;
  } else {
    // Only when the payload still includes the export/editor shell.
    out = unwrapKnownChromeDivs(out);
  }

  out = unwrapTableWrappers(out);

  out = out
    .replace(/<input\b[^>]*\btype=["']file["'][^>]*>/gi, '')
    .replace(/<br\b[^>]*\bProseMirror-trailingBreak\b[^>]*\/?>/gi, '')
    .replace(/\scontenteditable=(["'])[^"']*\1/gi, '')
    .replace(/\sspellcheck=(["'])[^"']*\1/gi, '')
    .replace(/\stranslate=(["'])[^"']*\1/gi, '')
    .replace(/\sdata-placeholder=(["'])[^"']*\1/gi, '')
    .replace(/<p>\s*<\/p>/gi, '');

  return out.trim();
}

/**
 * @param {string} html
 * @returns {string}
 */
function unwrapTableWrappers(html) {
  let out = html;
  const wrapperRe =
    /<div\b[^>]*\btableWrapper\b[^>]*>(?:(?!<div\b[^>]*\btableWrapper\b)[\s\S])*?<\/div>/gi;
  for (let i = 0; i < 64; i += 1) {
    let changed = false;
    out = out.replace(wrapperRe, (match) => {
      const tableMatch = match.match(/<table\b[\s\S]*<\/table>/i);
      changed = true;
      if (tableMatch) return tableMatch[0];
      return match.replace(/^<div\b[^>]*>/i, '').replace(/<\/div>\s*$/i, '');
    });
    if (!changed) break;
  }
  return out;
}

/**
 * Unwrap export/editor shell divs only (exact class tokens — not `tiptap-details` etc.).
 * @param {string} html
 * @returns {string}
 */
function unwrapKnownChromeDivs(html) {
  let out = html;
  const chromeClasses = [
    'tiptap-export-page',
    'tiptap-editor-shell',
    'tiptap-editor-shell__body',
    'tiptap-editor-shell__scroll',
    'ProseMirror',
  ];
  for (let pass = 0; pass < 32; pass += 1) {
    let changed = false;
    for (const cls of chromeClasses) {
      const re = new RegExp(
        `<div\\b[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
        'i',
      );
      const next = out.replace(re, '$1');
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    // Bare `class="tiptap"` / `class="tiptap ProseMirror"` shell (not tiptap-*).
    const tiptapShellRe =
      /<div\b[^>]*\bclass=["']([^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi;
    out = out.replace(tiptapShellRe, (full, classAttr, inner) => {
      const tokens = String(classAttr).trim().split(/\s+/);
      if (tokens.includes('tiptap') || tokens.includes('ProseMirror')) {
        // Only unwrap if this looks like the editor root, not a content widget.
        if (tokens.every((t) => t === 'tiptap' || t === 'ProseMirror' || t === 'resize-cursor')) {
          changed = true;
          return inner;
        }
      }
      return full;
    });
    if (!changed) break;
  }
  return out;
}

/**
 * @param {string} html
 * @returns {string | null}
 */
function extractProseMirrorInner(html) {
  const startRe = /<div\b[^>]*\b(?:ProseMirror|tiptap\s+ProseMirror|ProseMirror\s+tiptap)\b[^>]*>/i;
  const match = startRe.exec(html);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < html.length && depth > 0) {
    const slice = html.slice(i);
    const open = slice.search(/<div\b/i);
    const close = slice.search(/<\/div\s*>/i);
    if (close < 0) return null;
    if (open >= 0 && open < close) {
      depth += 1;
      i += open + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) return html.slice(startIdx, i + close).trim();
    i += close + 6;
  }
  return null;
}
