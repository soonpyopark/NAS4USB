import { MAX_FILE_INDENT } from './fileIndent.js';

/**
 * @param {string} html
 */
export function pageLevelFromHtml(html) {
  const text = String(html ?? '');
  const patterns = [
    /<meta[^>]+name=["']X-OneNote-(?:Page-)?Level["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']X-OneNote-(?:Page-)?Level["']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * @param {string} value
 */
function decodeHref(value) {
  const raw = String(value ?? '')
    .replace(/&amp;/g, '&')
    .split(/[?#]/)[0]
    .replace(/\\/g, '/');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {string} value
 */
function basenameOf(value) {
  const path = decodeHref(value);
  const parts = path.split('/').filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

/**
 * @param {string} value
 */
function normalizeTitle(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} attrs
 */
function levelFromAttrs(attrs) {
  const text = String(attrs ?? '');
  const data = text.match(/data-level\s*=\s*["']?(\d+)/i);
  if (data) {
    const n = Number(data[1]);
    if (Number.isFinite(n)) return n;
  }
  const cls = text.match(/level-(\d+)/i);
  if (cls) {
    const n = Number(cls[1]);
    if (Number.isFinite(n)) return n;
  }
  const indent = text.match(/(?:margin|padding)-left\s*:\s*(-?[\d.]+)\s*(px|em|rem)?/i);
  if (indent) {
    const n = Number(indent[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    const unit = (indent[2] || 'px').toLowerCase();
    if (unit === 'px') return Math.round(n / 20);
    return Math.round(n / 1.5);
  }
  return null;
}

/**
 * @param {string} html
 * @returns {{ title: string, href: string, level: number | null }[]}
 */
export function parseOnenoteTocLevels(html) {
  const source = String(html ?? '');
  const nav = source.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] || source;
  /** @type {{ title: string, href: string, level: number | null, nest: number }[]} */
  const items = [];
  let nest = 0;
  const tokenRe = /<\/?ul\b[^>]*>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match = tokenRe.exec(nav);
  while (match) {
    const token = match[0];
    if (/^<ul\b/i.test(token)) {
      nest += 1;
    } else if (/^<\/ul/i.test(token)) {
      nest = Math.max(0, nest - 1);
    } else {
      const attrs = match[1] || '';
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      const href = hrefMatch?.[1] || '';
      if (/\.html?$/i.test(decodeHref(href))) {
        const nearby = nav.slice(Math.max(0, match.index - 180), match.index);
        const wrap = nearby.match(/<(?:li|div|span)\b([^>]*)>\s*$/i);
        const fromWrap = wrap ? levelFromAttrs(wrap[1] || '') : null;
        const fromLink = levelFromAttrs(attrs);
        items.push({
          title: normalizeTitle(match[2]),
          href,
          level: fromLink ?? fromWrap,
          nest,
        });
      }
    }
    match = tokenRe.exec(nav);
  }

  if (items.length === 0) return [];
  const hasAttrLevel = items.some((item) => item.level != null);
  return items.map((item) => ({
    title: item.title,
    href: item.href,
    level: hasAttrLevel ? item.level : item.nest > 0 ? item.nest - 1 : 0,
  }));
}

/**
 * @param {(number | null | undefined)[]} levels
 */
export function normalizeOnenoteLevels(levels) {
  const nums = levels
    .map((value) => (value == null ? null : Number(value)))
    .filter((value) => value != null && Number.isFinite(value));
  if (nums.length === 0) return levels.map(() => 0);
  const min = Math.min(...nums);
  const shift = min >= 1 ? min : 0;
  return levels.map((value) => {
    if (value == null || !Number.isFinite(Number(value))) return 0;
    return Math.max(0, Math.min(MAX_FILE_INDENT, Math.round(Number(value) - shift)));
  });
}

/**
 * @param {{ title?: string, html?: string, htmlPath?: string }[]} pages
 * @param {string} [tocHtml]
 * @returns {number[]}
 */
export function assignOnenotePageLevels(pages, tocHtml = '') {
  const list = Array.isArray(pages) ? pages : [];
  const fromMeta = list.map((page) => pageLevelFromHtml(page?.html || ''));
  if (fromMeta.some((value) => value != null)) {
    return normalizeOnenoteLevels(fromMeta);
  }

  const toc = parseOnenoteTocLevels(tocHtml);
  if (toc.length === 0) return list.map(() => 0);

  const raw = list.map((page, index) => {
    const base = basenameOf(page?.htmlPath || '');
    const title = normalizeTitle(page?.title || '');
    const byHref = base ? toc.find((item) => basenameOf(item.href) === base) : null;
    if (byHref?.level != null) return byHref.level;
    const byTitle = title ? toc.find((item) => item.title === title) : null;
    if (byTitle?.level != null) return byTitle.level;
    if (toc.length === list.length && toc[index]?.level != null) return toc[index].level;
    return pageLevelFromHtml(page?.html || '');
  });
  return normalizeOnenoteLevels(raw);
}
