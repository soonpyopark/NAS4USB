import { getParentPath } from '../fsPaths.js';
import { buildMediaStreamUrl } from '../media/streamUrl.js';
import { NAS_SCROLLBAR_STYLE_MARK, nasScrollbarStyleTag } from '../ui/nasScrollbarStyle.js';

const ABSOLUTE_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i;
const PREVIEW_ICON_CLASS = 'nas-html-preview-icon';
const PREVIEW_STYLE_MARK = 'data-nas-html-preview';
const PREVIEW_ICON_STYLE = `<style ${PREVIEW_STYLE_MARK}>img.${PREVIEW_ICON_CLASS}{width:16px;height:16px;vertical-align:middle;margin-right:.4em;border:0}</style>`;

/**
 * Resolve a relative href against the HTML file's folder.
 * @param {string} htmlRelativePath
 * @param {string} href
 */
export function resolveHtmlPreviewAssetPath(htmlRelativePath, href) {
  const raw = String(href ?? '').trim();
  if (!raw || ABSOLUTE_HREF.test(raw)) return raw;
  const hashIndex = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  let cut = raw.length;
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);
  if (queryIndex >= 0) cut = Math.min(cut, queryIndex);
  const pathPart = raw.slice(0, cut);
  const suffix = raw.slice(cut);
  const parent = getParentPath(htmlRelativePath);
  const parts = parent === '.' ? [] : parent.split('/').filter(Boolean);
  for (const segment of pathPart.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  const resolved = parts.join('/');
  if (!resolved) return raw;
  return `${buildMediaStreamUrl(resolved)}${suffix}`;
}

/**
 * @param {string} attrs
 * @param {string} name
 */
function readHtmlAttr(attrs, name) {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(String(attrs ?? ''));
  return match ? String(match[1] ?? match[2] ?? match[3] ?? '').trim() : '';
}

/**
 * @param {string} value
 */
function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Netscape/Chrome bookmark `<A ICON="data:image/...">` is metadata, not a drawn image.
 * @param {string} html
 * @param {string} [htmlRelativePath]
 */
export function injectBookmarkIcons(html, htmlRelativePath = '') {
  return String(html ?? '').replace(
    /<a\b([^>]*)>(?!\s*<img[^>]*nas-html-preview-icon)/gi,
    (full, attrs) => {
      const icon = readHtmlAttr(attrs, 'icon');
      if (!icon) return full;
      const src = resolveHtmlPreviewAssetPath(htmlRelativePath, icon) || icon;
      return `${full}<img class="${PREVIEW_ICON_CLASS}" src="${escapeHtmlAttr(src)}" alt="" width="16" height="16">`;
    },
  );
}

/**
 * @param {string} html
 */
function injectPreviewHeadStyles(html) {
  const source = String(html ?? '');
  const parts = [];
  if (!source.includes(PREVIEW_STYLE_MARK)) parts.push(PREVIEW_ICON_STYLE);
  if (!source.includes(NAS_SCROLLBAR_STYLE_MARK)) parts.push(nasScrollbarStyleTag());
  if (parts.length === 0) return source;
  const injected = parts.join('');
  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${injected}`);
  }
  return `${injected}${source}`;
}

/**
 * Point relative src/href/poster and CSS url() at workspace stream URLs.
 * @param {string} html
 * @param {string} htmlRelativePath
 */
export function rewriteHtmlPreviewAssets(html, htmlRelativePath) {
  let next = String(html ?? '');
  if (htmlRelativePath) {
    next = next.replace(
      /\b(src|href|poster)\s*=\s*(["'])([^"']*)\2/gi,
      (full, attr, quote, value) => {
        const resolved = resolveHtmlPreviewAssetPath(htmlRelativePath, value);
        return `${attr}=${quote}${resolved}${quote}`;
      },
    );
    next = next.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, value) => {
      const resolved = resolveHtmlPreviewAssetPath(htmlRelativePath, value.trim());
      return `url(${quote}${resolved}${quote})`;
    });
  }
  return next;
}

/**
 * Preview-only HTML: rewrite sibling assets and surface bookmark ICON images.
 * @param {string} html
 * @param {string} [htmlRelativePath]
 */
export function prepareHtmlPreviewDocument(html, htmlRelativePath = '') {
  const withIcons = injectBookmarkIcons(html, htmlRelativePath);
  const rewritten = rewriteHtmlPreviewAssets(withIcons, htmlRelativePath);
  return injectPreviewHeadStyles(rewritten);
}
