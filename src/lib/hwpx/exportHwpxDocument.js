import { parseHwpxBase64 } from './hwpxIO.js';
import printPaginationCss from '../../styles/print-pagination.css?raw';

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

/**
 * @param {string} fileName
 */
export function getHwpxFileStem(fileName) {
  const base = String(fileName || 'document').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return base.replace(/\.hwpx$/i, '') || 'document';
}

const HWPX_EXPORT_CSS = `
  @page { size: A4; margin: 15mm 20mm 17mm 20mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  body {
    padding: 12mm 16mm;
    font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #000;
  }
  .rhwp-hwpx-export {
    box-sizing: border-box;
    max-width: 210mm;
    width: 100%;
    margin: 0 auto;
  }
  .rhwp-hwpx-export p { margin: 0.15em 0; }
  .rhwp-hwpx-export h1,
  .rhwp-hwpx-export h2,
  .rhwp-hwpx-export h3,
  .rhwp-hwpx-export h4,
  .rhwp-hwpx-export h5,
  .rhwp-hwpx-export h6 {
    margin: 0.45em 0 0.25em;
    line-height: 1.3;
  }
  .rhwp-hwpx-export img,
  .rhwp-hwpx-export .rhwp-image {
    max-width: 100%;
    height: auto;
  }
  .rhwp-hwpx-export table,
  .rhwp-hwpx-export .rhwp-table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
  }
  .rhwp-hwpx-export td,
  .rhwp-hwpx-export th,
  .rhwp-hwpx-export .rhwp-table-cell {
    border: 1px solid #c5c5c5;
    padding: 0.28em 0.45em;
    vertical-align: top;
    word-break: break-word;
  }
  @media print {
    body { padding: 0; }
    .rhwp-hwpx-export { max-width: none; }
  }
  ${printPaginationCss}
`;

/**
 * @param {string} bodyHtml
 */
function extractBodyInnerHtml(bodyHtml) {
  const raw = String(bodyHtml ?? '').trim();
  if (!raw) return '';
  if (!/<(?:html|body)\b/i.test(raw)) return raw;

  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const body = doc.body;
  return body ? body.innerHTML.trim() : raw;
}

/**
 * Approximate Hangul layout HTML for print / PDF (not page-accurate rhwp render).
 *
 * @param {string} bodyHtml
 * @param {string} title
 */
export function wrapHwpxExportHtml(bodyHtml, title) {
  const inner = extractBodyInnerHtml(bodyHtml);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${HWPX_EXPORT_CSS}
</style>
</head>
<body>
<article class="rhwp-hwpx-export">
${inner || '<p></p>'}
</article>
</body>
</html>
`;
}

/**
 * @param {string} hwpxBase64
 * @param {string} [fileName]
 * @returns {Promise<{ title: string, html: string }>}
 */
export async function buildHwpxExportHtml(hwpxBase64, fileName = 'document.hwpx') {
  if (!hwpxBase64) {
    throw new Error('HWPX 데이터가 비어 있습니다.');
  }
  const title = getHwpxFileStem(fileName);
  const parsed = await parseHwpxBase64(hwpxBase64);
  const html = wrapHwpxExportHtml(parsed.html, title);
  if (!parsed.html?.trim()) {
    throw new Error('인쇄할 본문을 만들지 못했습니다.');
  }
  return { title, html };
}

/**
 * @param {number} px
 */
function cssPxToMm(px) {
  return Math.round((Number(px) * 25.4) / 96 * 1000) / 1000;
}

/**
 * @param {number} value
 */
function formatMm(value) {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * @param {string} svg
 */
function inferSvgSizeMm(svg) {
  const source = String(svg ?? '');
  const widthAttr = source.match(/\bwidth=["']([\d.]+)(px|mm|pt)?["']/i);
  const heightAttr = source.match(/\bheight=["']([\d.]+)(px|mm|pt)?["']/i);
  const viewBox = source.match(/\bviewBox=["'][^"']*?([\d.]+)\s+([\d.]+)["']/i);
  const read = (match, fallbackPx) => {
    if (!match) {
      return fallbackPx > 0 ? cssPxToMm(fallbackPx) : null;
    }
    const value = Number(match[1]);
    const unit = (match[2] || 'px').toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return null;
    if (unit === 'mm') return value;
    if (unit === 'pt') return Math.round((value * 25.4) / 72 * 1000) / 1000;
    return cssPxToMm(value);
  };
  const vbWidth = viewBox ? Number(viewBox[1]) : 0;
  const vbHeight = viewBox ? Number(viewBox[2]) : 0;
  return {
    widthMm: read(widthAttr, vbWidth),
    heightMm: read(heightAttr, vbHeight),
  };
}

/**
 * Prefix SVG ids so clipPath / gradient refs do not collide across pages.
 *
 * @param {string} svg
 * @param {string} prefix
 */
function uniquifySvgIds(svg, prefix) {
  const source = String(svg ?? '').trim();
  if (!source || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return source;
  }
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') return source;

  /** @type {Map<string, string>} */
  const ids = new Map();
  const withId = [root, ...Array.from(root.querySelectorAll('[id]'))].filter((el) =>
    el.getAttribute?.('id'),
  );
  for (const el of withId) {
    const current = el.getAttribute('id');
    if (!current || ids.has(current)) continue;
    ids.set(current, `${prefix}-${current}`);
  }
  if (ids.size === 0) return source;

  const rewrite = (value) => {
    let next = String(value ?? '');
    for (const [from, to] of ids) {
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = next.replace(new RegExp(`url\\((['"]?)#${escaped}\\1\\)`, 'g'), `url(#${to})`);
      if (next === `#${from}`) next = `#${to}`;
    }
    return next;
  };

  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.name === 'id') {
        const mapped = ids.get(attr.value);
        if (mapped) el.setAttribute('id', mapped);
        continue;
      }
      const rewritten = rewrite(attr.value);
      if (rewritten !== attr.value) el.setAttribute(attr.name, rewritten);
    }
  }

  return new XMLSerializer().serializeToString(root);
}

/**
 * rhwp page SVGs → one HTML document (named @page sizes, same as studio print).
 *
 * @param {{ svg: string, widthMm?: number | null, heightMm?: number | null }[]} pages
 * @param {string} title
 */
export function wrapHwpxPageSvgsHtml(pages, title) {
  const prepared = (Array.isArray(pages) ? pages : [])
    .map((page, index) => {
      const inferred = inferSvgSizeMm(page.svg);
      const widthMm = Number(page.widthMm) > 0 ? Number(page.widthMm) : inferred.widthMm;
      const heightMm = Number(page.heightMm) > 0 ? Number(page.heightMm) : inferred.heightMm;
      if (!page.svg?.trim() || !widthMm || !heightMm) return null;
      const name = `rhwp-print-page-${index + 1}`;
      return {
        svg: uniquifySvgIds(page.svg, name),
        widthMm,
        heightMm,
        name,
      };
    })
    .filter(Boolean);

  if (prepared.length === 0) {
    throw new Error('인쇄할 페이지를 만들지 못했습니다.');
  }

  const pageCss = prepared
    .map(
      (page) =>
        `@page ${page.name} { size: ${formatMm(page.widthMm)}mm ${formatMm(page.heightMm)}mm; margin: 0; }
.${page.name} { page: ${page.name}; width: ${formatMm(page.widthMm)}mm; height: ${formatMm(page.heightMm)}mm; }`,
    )
    .join('\n');

  const body = prepared
    .map((page) => `<section class="page ${page.name}">${page.svg}</section>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
* { margin: 0; padding: 0; }
body { background: #fff; }
.page { break-after: page; page-break-after: always; overflow: hidden; }
.page:last-child { break-after: auto; page-break-after: auto; }
.page svg { width: 100%; height: 100%; display: block; }
${pageCss}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * @param {{ svg: string, widthMm?: number | null, heightMm?: number | null }[]} pages
 * @param {string} fileName
 * @returns {Promise<{ title: string, html: string }>}
 */
export function buildHwpxPagesExportHtml(pages, fileName = 'document.hwpx') {
  const title = getHwpxFileStem(fileName);
  return { title, html: wrapHwpxPageSvgsHtml(pages, title) };
}

/**
 * @param {string} hwpxBase64
 * @param {string} fileName
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>}
 */
export async function exportHwpxBase64AsPdf(hwpxBase64, fileName) {
  const { title, html } = await buildHwpxExportHtml(hwpxBase64, fileName);
  const { exportHtmlDocumentAsPdf } = await import('../pdf/exportHtmlAsPdf.js');
  return exportHtmlDocumentAsPdf({ html, title });
}

/**
 * @param {{ svg: string, widthMm?: number | null, heightMm?: number | null }[]} pages
 * @param {string} fileName
 */
export async function exportHwpxPagesAsPdf(pages, fileName) {
  const { title, html } = buildHwpxPagesExportHtml(pages, fileName);
  const { exportHtmlDocumentAsPdf } = await import('../pdf/exportHtmlAsPdf.js');
  return exportHtmlDocumentAsPdf({
    html,
    title,
    marginMm: 0,
    preferCssPageSize: true,
    fitA4Css: false,
  });
}

/**
 * @param {string} hwpxBase64
 * @param {string} fileName
 */
export async function printHwpxBase64(hwpxBase64, fileName) {
  const { html } = await buildHwpxExportHtml(hwpxBase64, fileName);
  const { printHtmlDocument } = await import('../print/printHtmlDocument.js');
  return printHtmlDocument(html);
}

/**
 * @param {{ svg: string, widthMm?: number | null, heightMm?: number | null }[]} pages
 * @param {string} fileName
 */
export async function printHwpxPages(pages, fileName) {
  const { html } = buildHwpxPagesExportHtml(pages, fileName);
  const { printHtmlDocument } = await import('../print/printHtmlDocument.js');
  return printHtmlDocument(html);
}
