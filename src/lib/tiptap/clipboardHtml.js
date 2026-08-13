import { DOMParser as SchemaDOMParser } from '@tiptap/pm/model';

/**
 * OneNote / Word put a screenshot PNG on the clipboard *and* HTML.
 * Prefer HTML when it looks like a real document, not a lone image.
 */

/**
 * @param {string} html
 */
export function extractClipboardHtmlFragment(html) {
  const raw = String(html ?? '');
  if (!raw.trim()) return '';

  const start = raw.indexOf('<!--StartFragment-->');
  const end = raw.indexOf('<!--EndFragment-->');
  if (start >= 0 && end > start) {
    return raw.slice(start + '<!--StartFragment-->'.length, end);
  }

  const body = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body?.[1]) return body[1];
  return raw;
}

/**
 * @param {string} html
 */
function visibleTextFromHtml(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} html
 */
export function clipboardHtmlLooksEditable(html) {
  const fragment = extractClipboardHtmlFragment(html);
  if (!fragment || fragment.length < 12) return false;

  const text = visibleTextFromHtml(fragment);
  const lowered = fragment.toLowerCase();
  const officeLike =
    /onenote|microsoft office|urn:schemas-microsoft-com:office|mso-|progid\s+content=["']?onenote/i.test(
      html,
    );
  const hasBlocks = /<(p|h[1-6]|ul|ol|li|table|blockquote|pre|div|span|td|th)\b/i.test(fragment);
  const imageOnly =
    text.length < 4 && /<img\b/i.test(lowered) && !/<(p|h[1-6]|li|td|table)\b/i.test(lowered);

  if (imageOnly) return false;
  if (officeLike && (text.length >= 1 || hasBlocks)) return true;
  if (text.length >= 8 && hasBlocks) return true;
  return false;
}

/**
 * @param {DataTransfer | null | undefined} clipboard
 */
export function clipboardHasEditableHtml(clipboard) {
  if (!clipboard) return false;
  const html = clipboard.getData?.('text/html') || '';
  return clipboardHtmlLooksEditable(html);
}

/**
 * @param {string} cssColor
 */
function cssColorToHex(cssColor) {
  const value = String(cssColor ?? '').trim();
  if (!value || value === 'transparent' || value === 'inherit') return '';
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return value;
  const hex = [rgb[1], rgb[2], rgb[3]]
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

/**
 * @param {string} hex
 */
function isNearWhite(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > 245 && g > 245 && b > 245;
}

/**
 * @param {Element} el
 * @param {string} tagName
 * @param {Record<string, string>} [attrs]
 */
function wrapContents(el, tagName, attrs = {}) {
  if (!el.childNodes.length) return;
  const wrapper = el.ownerDocument.createElement(tagName);
  for (const [key, value] of Object.entries(attrs)) {
    wrapper.setAttribute(key, value);
  }
  while (el.firstChild) {
    wrapper.appendChild(el.firstChild);
  }
  el.appendChild(wrapper);
}

/**
 * Promote Word/OneNote inline styles into tags TipTap already parses.
 * @param {ParentNode} root
 */
function promoteOfficeInlineStyles(root) {
  const styled = [...root.querySelectorAll('[style]')];
  for (const el of styled) {
    if (!(el instanceof HTMLElement)) continue;
    const style = el.style;
    if (/bold|[7-9]00/.test(style.fontWeight) && !el.closest('strong, b, h1, h2, h3, h4, h5, h6')) {
      wrapContents(el, 'strong');
    }
    if (style.fontStyle === 'italic' && !el.closest('em, i')) {
      wrapContents(el, 'em');
    }
    if (/\bunderline\b/i.test(style.textDecoration) && !el.closest('u')) {
      wrapContents(el, 'u');
    }
    const bg = cssColorToHex(style.backgroundColor);
    if (bg && !isNearWhite(bg) && !el.closest('mark')) {
      wrapContents(el, 'mark', { 'data-color': bg, style: `background-color: ${bg}` });
    }
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
export function normalizeOfficeClipboardHtml(html) {
  const fragment = extractClipboardHtmlFragment(html);
  if (!fragment.trim()) return '';
  if (typeof document === 'undefined') return fragment;

  const template = document.createElement('template');
  template.innerHTML = fragment;

  for (const node of [...template.content.querySelectorAll('style, script, xml, meta, link')]) {
    node.remove();
  }
  for (const node of [...template.content.querySelectorAll('o\\:p, v\\:shapetype, v\\:shape')]) {
    node.remove();
  }

  promoteOfficeInlineStyles(template.content);
  return template.innerHTML.trim();
}

/**
 * Insert cleaned HTML at the current selection.
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {string} html
 */
export function insertHtmlIntoView(view, html) {
  const cleaned = normalizeOfficeClipboardHtml(html);
  if (!cleaned) return false;

  const template = document.createElement('template');
  template.innerHTML = cleaned;
  const parser = SchemaDOMParser.fromSchema(view.state.schema);
  const slice = parser.parseSlice(template.content, { preserveWhitespace: true });
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}
