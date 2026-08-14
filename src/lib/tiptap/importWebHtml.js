/**
 * Import a rendered web page (not clipboard HTML).
 *
 * Pages like the calendar export style everything through class rules, so the
 * `<style>` block carries the table fills, badge colors and boxed details.
 * TipTap only keeps inline styles, so the document is rendered in an isolated
 * iframe first and the computed look is written back onto each element.
 */

const STRIPE_GLYPH = '▌';
const RENDER_TIMEOUT_MS = 4000;
const SKIP_TAGS = /^(SCRIPT|STYLE|LINK|META|TITLE|HEAD|COL|COLGROUP|BASE|NOSCRIPT)$/;

/**
 * @param {string} html
 */
export function looksLikeWebDocument(html) {
  const raw = String(html ?? '');
  if (!raw.trim()) return false;
  // Clipboard fragments and OneNote exports have their own importers.
  if (/<!--StartFragment-->/i.test(raw)) return false;
  if (/X-OneNote-Order|X-Original-Page-Id|outline-element/i.test(raw)) return false;
  if (/class="[^"]*\b(tiptap|ProseMirror)\b/i.test(raw)) return false;
  if (!/<style[\s>]/i.test(raw)) return false;
  return /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw);
}

/**
 * @param {string} value
 */
function isTransparentColor(value) {
  const color = String(value ?? '').trim().toLowerCase();
  if (!color || color === 'transparent') return true;
  return /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(color);
}

/**
 * @param {string} value
 */
function isBoldWeight(value) {
  const weight = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(weight) ? weight >= 600 : /bold/i.test(String(value ?? ''));
}

/**
 * @param {Element | null} el
 */
function hasText(el) {
  return Boolean(el && String(el.textContent || '').replace(/\u00a0/g, ' ').trim());
}

/**
 * @param {string} html
 * @param {(doc: Document) => void} render
 * @returns {Promise<string | null>}
 */
async function withRenderedDocument(html, render) {
  if (typeof document === 'undefined' || !document.body) return null;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.style.cssText =
    'position:fixed;left:-99999px;top:0;width:1200px;height:900px;border:0;visibility:hidden';

  document.body.appendChild(frame);
  try {
    await new Promise((resolve) => {
      const timer = window.setTimeout(resolve, RENDER_TIMEOUT_MS);
      frame.addEventListener(
        'load',
        () => {
          window.clearTimeout(timer);
          resolve(undefined);
        },
        { once: true },
      );
      frame.srcdoc = html;
    });

    const doc = frame.contentDocument;
    if (!doc?.body) return null;

    render(doc);

    for (const node of [...doc.body.querySelectorAll('style, script, link, meta, noscript')]) {
      node.remove();
    }
    return doc.body.innerHTML;
  } finally {
    frame.remove();
  }
}

/**
 * Write the rendered look onto each element so it survives class-less import.
 * @param {Document} doc
 */
function inlineComputedStyles(doc) {
  const view = doc.defaultView;
  if (!view) return;

  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (!(el instanceof view.HTMLElement) || SKIP_TAGS.test(el.tagName)) continue;

    const style = view.getComputedStyle(el);
    const parent = el.parentElement;
    const parentStyle = parent ? view.getComputedStyle(parent) : null;

    if (style.color && style.color !== parentStyle?.color) {
      el.style.color = style.color;
    }
    if (!isTransparentColor(style.backgroundColor)) {
      el.style.backgroundColor = style.backgroundColor;
    }
    if (isBoldWeight(style.fontWeight) && !isBoldWeight(parentStyle?.fontWeight ?? '400')) {
      el.style.fontWeight = '700';
    }
    if (style.fontStyle === 'italic') {
      el.style.fontStyle = 'italic';
    }
    if (el.tagName !== 'A' && /underline|line-through/.test(style.textDecorationLine)) {
      el.style.textDecoration = style.textDecorationLine;
    }
    if (style.textAlign && style.textAlign !== parentStyle?.textAlign) {
      el.style.textAlign = style.textAlign;
    }
    if (style.fontSize && style.fontSize !== parentStyle?.fontSize) {
      el.style.fontSize = style.fontSize;
    }
  }
}

/**
 * A thin filled element with no text is a color bar (calendar event stripe).
 * Keep it as a colored glyph on the line it belongs to.
 * @param {Document} doc
 */
function convertColorBars(doc) {
  const view = doc.defaultView;
  if (!view) return;

  for (const el of [...doc.body.querySelectorAll('span, div, i, b')]) {
    if (!(el instanceof view.HTMLElement)) continue;
    if (hasText(el) || el.querySelector('img, svg, table')) continue;

    const color = el.style.backgroundColor;
    if (isTransparentColor(color)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width > 12 && rect.height > 12) continue;

    const bar = doc.createElement('span');
    bar.setAttribute('style', `color: ${color}`);
    bar.textContent = `${STRIPE_GLYPH} `;

    const host = firstTextBlock(el.parentElement, el);
    if (host) {
      host.insertBefore(bar, host.firstChild);
      el.remove();
    } else {
      el.replaceWith(bar);
    }
  }
}

/**
 * @param {Element | null} root
 * @param {Element} exclude
 */
function firstTextBlock(root, exclude) {
  if (!root) return null;
  for (const candidate of [...root.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, td, th')]) {
    if (candidate === exclude || candidate.contains(exclude)) continue;
    if (!hasText(candidate)) continue;
    if (candidate.querySelector('p, div, li, table')) continue;
    return candidate;
  }
  return null;
}

/**
 * @param {string} html
 * @returns {Promise<string | null>}
 */
export async function flattenWebDocumentHtml(html) {
  try {
    return await withRenderedDocument(html, (doc) => {
      inlineComputedStyles(doc);
      convertColorBars(doc);
    });
  } catch {
    return null;
  }
}
