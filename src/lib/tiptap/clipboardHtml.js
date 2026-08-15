import { DOMParser as SchemaDOMParser } from '@tiptap/pm/model';
import { rematerializePastedTiptapAssets } from './copyPasteAssets.js';
import { materializePastedImages, promoteVmlImages } from './pasteImages.js';

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
  if (!value || value === 'transparent' || value === 'inherit' || value === 'windowtext') return '';
  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    return value.length === 7 ? value : value.slice(0, 7);
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
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
  const m = /^#([0-9a-f]{6})$/i.exec(cssColorToHex(hex));
  if (!m) return false;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > 245 && g > 245 && b > 245;
}

/**
 * @param {string} hex
 */
function isNearBlack(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(cssColorToHex(hex));
  if (!m) return false;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r < 28 && g < 28 && b < 28;
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
    const textColor = cssColorToHex(style.color);
    if (textColor && !isNearBlack(textColor) && el.tagName === 'SPAN' && !style.color.startsWith('var(')) {
      el.style.color = textColor;
    }
    const bg = cssColorToHex(style.backgroundColor);
    if (bg && !isNearWhite(bg) && !el.closest('mark') && isInlineHighlightHost(el)) {
      wrapContents(el, 'mark', { 'data-color': bg, style: `background-color: ${bg}` });
    }
  }
}

const INLINE_HIGHLIGHT_TAGS = new Set(['SPAN', 'FONT', 'A', 'LABEL', 'EM', 'STRONG', 'B', 'I', 'U']);

/**
 * @param {Element} el
 */
function isInlineHighlightHost(el) {
  return INLINE_HIGHLIGHT_TAGS.has(el.tagName);
}

/**
 * @param {Element} el
 */
function isEmptyOfficeBlock(el) {
  if (el.querySelector('img, table, video, audio, hr, ul, ol')) return false;
  const text = String(el.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .trim();
  return !text;
}

/**
 * Word/OneNote end every paragraph with <br>. ProseMirror keeps that as an
 * extra empty line. Real mid-paragraph breaks stay.
 * @param {ParentNode} root
 */
function stripOfficeTrailingBreaks(root) {
  for (const el of [...root.querySelectorAll('p, div, li, td, th, h1, h2, h3, h4, h5, h6')]) {
    while (el.lastChild) {
      const last = el.lastChild;
      if (last.nodeName === 'BR') {
        last.remove();
        continue;
      }
      if (last.nodeType === Node.TEXT_NODE && !String(last.textContent || '').replace(/\u00a0/g, ' ').trim()) {
        last.remove();
        continue;
      }
      if (
        last instanceof Element &&
        /^(SPAN|FONT|B|I|U|EM|STRONG)$/i.test(last.tagName) &&
        isEmptyOfficeBlock(last)
      ) {
        last.remove();
        continue;
      }
      break;
    }
  }
}

/**
 * Drop `<p><br></p>` / `&nbsp;` rows that OneNote inserts between outline lines.
 * @param {ParentNode} root
 */
function removeEmptyOfficeBlocks(root) {
  for (const el of [...root.querySelectorAll('p')]) {
    if (isEmptyOfficeBlock(el)) el.remove();
  }
  for (const el of [...root.querySelectorAll('div')]) {
    if (isEmptyOfficeBlock(el) && !el.querySelector('p, div, table, ul, ol')) el.remove();
  }
}

/**
 * Keep OneNote container / cell fills as a table cell instead of wrapping
 * block contents in <mark> (invalid HTML and extra gaps). Inside a cell this
 * becomes a nested table, which the schema allows.
 * @param {ParentNode} root
 */
function promoteTintedContainersToCells(root) {
  for (const el of [...root.querySelectorAll('div, p')]) {
    if (!(el instanceof HTMLElement)) continue;
    const bg = cssColorToHex(el.style.backgroundColor);
    if (!bg || isNearWhite(bg)) continue;

    // A block repeating its cell's fill would only draw a box on top of a box.
    const parentCell = el.closest('td, th');
    if (parentCell instanceof HTMLElement && cssColorToHex(parentCell.style.backgroundColor) === bg) {
      el.style.removeProperty('background-color');
      continue;
    }

    const doc = el.ownerDocument;
    const table = doc.createElement('table');
    const row = doc.createElement('tr');
    const cell = doc.createElement('td');
    cell.style.backgroundColor = bg;
    el.style.removeProperty('background-color');

    if (el.tagName === 'DIV') {
      while (el.firstChild) cell.appendChild(el.firstChild);
    } else {
      const paragraph = doc.createElement('p');
      while (el.firstChild) paragraph.appendChild(el.firstChild);
      cell.appendChild(paragraph);
    }

    row.appendChild(cell);
    table.appendChild(row);
    el.replaceWith(table);
  }
}

/**
 * Drop OneNote/Word line-height and vertical paragraph gaps so editor CSS applies.
 * Keep left/right indent.
 * @param {ParentNode} root
 */
function stripOfficeLineSpacing(root) {
  for (const el of [...root.querySelectorAll('[style]')]) {
    if (!(el instanceof HTMLElement)) continue;

    el.style.removeProperty('line-height');
    el.style.removeProperty('mso-line-height-rule');
    el.style.removeProperty('mso-line-height-alt');

    const tag = el.tagName.toLowerCase();
    if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'td' || tag === 'th') {
      const marginLeft = el.style.marginLeft;
      const marginRight = el.style.marginRight;
      el.style.removeProperty('margin');
      el.style.removeProperty('margin-top');
      el.style.removeProperty('margin-bottom');
      el.style.removeProperty('padding-top');
      el.style.removeProperty('padding-bottom');
      if (marginLeft) el.style.marginLeft = marginLeft;
      if (marginRight) el.style.marginRight = marginRight;
    }

    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
}

/**
 * OneNote often colors text via <style> classes or <font color>, which TipTap
 * drops. Copy computed/attribute colors onto <span style="color:…">.
 * @param {ParentNode} root
 */
function inlineOfficeTextColors(root) {
  if (typeof document === 'undefined' || !document.body) {
    convertFontTagsToSpans(root);
    wrapBlockColorsAsSpans(root);
    return;
  }

  const host = document.createElement('div');
  host.setAttribute('style', 'position:fixed;left:-99999px;top:0;color:#000000;background:#ffffff');
  while (root.firstChild) host.appendChild(root.firstChild);
  document.body.appendChild(host);

  try {
    for (const el of [...host.querySelectorAll('*')]) {
      if (!(el instanceof HTMLElement)) continue;
      if (/^(STYLE|SCRIPT|META|LINK|TABLE|IMG|VIDEO|AUDIO|BR|HR|COL|COLGROUP)$/i.test(el.tagName)) {
        continue;
      }
      const computed = getComputedStyle(el).color;
      const parentColor = el.parentElement ? getComputedStyle(el.parentElement).color : 'rgb(0, 0, 0)';
      if (!computed || computed === parentColor) continue;
      const hex = cssColorToHex(computed);
      if (!hex || isNearBlack(hex)) continue;
      if (!el.style.color) el.style.color = hex;
    }
  } finally {
    while (host.firstChild) root.appendChild(host.firstChild);
    host.remove();
  }

  convertFontTagsToSpans(root);
  wrapBlockColorsAsSpans(root);
}

/**
 * @param {ParentNode} root
 */
function convertFontTagsToSpans(root) {
  for (const font of [...root.querySelectorAll('font')]) {
    const raw = font.getAttribute('color') || font.style.color || '';
    const hex = cssColorToHex(raw);
    const span = font.ownerDocument.createElement('span');
    if (font.getAttribute('style')) span.setAttribute('style', font.getAttribute('style') || '');
    if (hex && !isNearBlack(hex)) span.style.color = hex;
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  }
}

/**
 * TipTap Color only parses span[style]. Move p/div/td colors onto a span.
 * @param {ParentNode} root
 */
function wrapBlockColorsAsSpans(root) {
  for (const el of [...root.querySelectorAll('p, div, td, th, li, h1, h2, h3, h4, h5, h6')]) {
    if (!(el instanceof HTMLElement) || !el.style.color) continue;
    const hex = cssColorToHex(el.style.color);
    if (!hex || isNearBlack(hex)) continue;
    wrapContents(el, 'span', { style: `color: ${hex}` });
    // Keep the block color too — Y.js / backup can drop span marks while
    // paragraph/heading attrs still round-trip.
    el.style.color = hex;
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

  inlineOfficeTextColors(template.content);
  for (const node of [...template.content.querySelectorAll('style, script, xml, meta, link')]) {
    node.remove();
  }
  promoteVmlImages(template.content);
  for (const node of [...template.content.querySelectorAll('o\\:p, v\\:shapetype, v\\:shape')]) {
    node.remove();
  }
  for (const node of [...template.content.querySelectorAll('*')]) {
    if (/^(o:p|v:shapetype|v:shape)$/i.test(node.tagName)) node.remove();
  }

  promoteOfficeInlineStyles(template.content);
  stripOfficeLineSpacing(template.content);
  promoteTintedContainersToCells(template.content);
  stripOfficeTrailingBreaks(template.content);
  removeEmptyOfficeBlocks(template.content);
  return template.innerHTML.trim();
}

/**
 * Insert cleaned HTML at the current selection.
 * Uploads pasted images to the document sidecar when `uploadFile` is provided.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {string} html
 * @param {{
 *   files?: File[],
 *   uploadFile?: (file: File) => Promise<string>,
 *   destTiptapPath?: string,
 * }} [options]
 */
export async function insertHtmlIntoView(view, html, options = {}) {
  const isProseMirror = /data-pm-slice/i.test(String(html || ''));
  let cleaned = isProseMirror
    ? extractClipboardHtmlFragment(html) || String(html || '')
    : normalizeOfficeClipboardHtml(html);
  if (!cleaned) return false;

  if (options.uploadFile) {
    cleaned = await materializePastedImages(cleaned, {
      files: options.files || [],
      uploadFile: options.uploadFile,
    });
    if (options.destTiptapPath) {
      cleaned = await rematerializePastedTiptapAssets(cleaned, {
        destTiptapPath: options.destTiptapPath,
        uploadFile: options.uploadFile,
      });
    }
  }
  if (!cleaned) return false;

  const template = document.createElement('template');
  template.innerHTML = cleaned;
  const parser = SchemaDOMParser.fromSchema(view.state.schema);
  const slice = parser.parseSlice(template.content, { preserveWhitespace: false });
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}
