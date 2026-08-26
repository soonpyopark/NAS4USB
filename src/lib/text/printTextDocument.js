import printPaginationCss from '../../styles/print-pagination.css?raw';
import { prepareHtmlPreviewDocument } from './htmlPreview.js';
import { printHtmlDocument } from '../print/printHtmlDocument.js';

/**
 * @param {string} fileName
 * @param {string} [extension]
 */
export function getTextPrintStem(fileName, extension = '') {
  const base = String(fileName || 'NoName').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const ext = String(extension || '').replace(/^\./, '');
  const stripped = ext
    ? base.replace(new RegExp(`\\.${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '')
    : base.replace(/\.(html?|txt)$/i, '');
  return stripped || 'NoName';
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

const TEXT_PRINT_CSS = `
  @page { size: A3; margin: 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    color: #1e293b;
    line-height: 1.6;
  }
  .text-export {
    box-sizing: border-box;
    max-width: 297mm;
    width: 100%;
    margin: 0 auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.95rem;
  }
  .html-print {
    box-sizing: border-box;
    max-width: 297mm;
    width: 100%;
    margin: 0 auto;
  }
  .html-print img { max-width: 100%; height: auto; }
  @media print {
    body { padding: 0; }
    .text-export, .html-print { max-width: none; }
  }
  ${printPaginationCss}
`;

const HTML_PRINT_STYLE = `<style data-nas-html-print>
@page { size: A3; margin: 16mm; }
${printPaginationCss}
</style>`;

/**
 * Preview iframe does not run scripts; the print iframe would. Strip them first.
 *
 * @param {string} html
 */
function stripActiveScripts(html) {
  return String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, ' $1=$2#$2');
}

/**
 * @param {string} html
 */
function isFullHtmlDocument(html) {
  return /<!DOCTYPE\s+html|<html[\s>]/i.test(String(html ?? ''));
}

/**
 * @param {string} html
 */
function injectPrintStyles(html) {
  const source = String(html ?? '');
  if (source.includes('data-nas-html-print')) return source;
  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${HTML_PRINT_STYLE}`);
  }
  return `${HTML_PRINT_STYLE}${source}`;
}

/**
 * @param {string} text
 * @param {string} title
 */
export function plainTextToStandaloneHtml(text, title) {
  const safeTitle = escapeHtml(title || 'NoName');
  const body = escapeHtml(text);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
${TEXT_PRINT_CSS}
</style>
</head>
<body>
<pre class="text-export">${body}</pre>
</body>
</html>
`;
}

/**
 * @param {string} html
 * @param {string} title
 * @param {string} [htmlRelativePath]
 */
export function htmlSourceToPrintableDocument(html, title, htmlRelativePath = '') {
  const prepared = stripActiveScripts(prepareHtmlPreviewDocument(html, htmlRelativePath));
  if (isFullHtmlDocument(prepared)) {
    return injectPrintStyles(prepared);
  }

  const safeTitle = escapeHtml(title || 'NoName');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
${TEXT_PRINT_CSS}
</style>
</head>
<body>
<div class="html-print">${prepared}</div>
</body>
</html>
`;
}

/**
 * @param {string} fileName
 * @param {string} text
 * @param {string} [extension]
 */
export async function printPlainText(fileName, text, extension = 'txt') {
  const title = getTextPrintStem(fileName, extension);
  await printHtmlDocument(plainTextToStandaloneHtml(text, title));
}

/**
 * @param {string} fileName
 * @param {string} html
 * @param {string} [htmlRelativePath]
 */
export async function printHtmlSource(fileName, html, htmlRelativePath = '') {
  const title = getTextPrintStem(fileName);
  await printHtmlDocument(htmlSourceToPrintableDocument(html, title, htmlRelativePath));
}
