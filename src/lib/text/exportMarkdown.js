import { renderMarkdown } from './markdown.js';
import { decodeTextBase64, encodeTextBase64 } from './textIO.js';
import { exportFileName } from '../browserDownload.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import printPaginationCss from '../../styles/print-pagination.css?raw';

/**
 * @param {string} fileName
 */
export function getMarkdownFileStem(fileName) {
  const base = String(fileName || 'NoName').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return base.replace(/\.md$/i, '') || 'NoName';
}

/**
 * @param {string} relativePath
 */
export function isMarkdownRelativePath(relativePath) {
  return /\.md$/i.test(String(relativePath || ''));
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

const MARKDOWN_EXPORT_CSS = `
  @page { size: A3; margin: 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    color: #1e293b;
    line-height: 1.6;
  }
  .markdown-export {
    box-sizing: border-box;
    max-width: 297mm;
    width: 100%;
    margin: 0 auto;
  }
  .markdown-export h1 { font-size: 1.75rem; font-weight: 700; margin: 1.25em 0 0.5em; }
  .markdown-export h2 { font-size: 1.4rem; font-weight: 700; margin: 1.1em 0 0.45em; }
  .markdown-export h3 { font-size: 1.2rem; font-weight: 600; margin: 1em 0 0.4em; }
  .markdown-export h4, .markdown-export h5, .markdown-export h6 {
    font-size: 1.05rem; font-weight: 600; margin: 0.9em 0 0.35em;
  }
  .markdown-export p { margin: 0.55em 0; }
  .markdown-export ul, .markdown-export ol { margin: 0.55em 0; padding-left: 1.5em; }
  .markdown-export ol { list-style: decimal; }
  .markdown-export ul { list-style: disc; }
  .markdown-export blockquote {
    margin: 0.75em 0;
    padding: 0.25em 0 0.25em 0.9em;
    border-left: 3px solid #cbd5e1;
    color: #475569;
  }
  .markdown-export code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: #f1f5f9;
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }
  .markdown-export pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 12px 14px;
    border-radius: 6px;
    overflow: auto;
  }
  .markdown-export pre code { background: transparent; padding: 0; color: inherit; }
  .markdown-export a { color: #0369a1; }
  .markdown-export hr { border: 0; border-top: 1px solid #cbd5e1; margin: 1.25em 0; }
  .markdown-export img { max-width: 100%; height: auto; margin: 0.75em 0; }
  .markdown-export table { border-collapse: collapse; width: 100%; margin: 0.75em 0; }
  .markdown-export th, .markdown-export td {
    border: 1px solid #cbd5e1;
    padding: 0.4em 0.6em;
    vertical-align: top;
  }
  .markdown-export th { font-weight: 600; background: #f8fafc; }
  @media print {
    body { padding: 0; }
    .markdown-export { max-width: none; }
  }
  ${printPaginationCss}
`;

/**
 * @param {string} markdown
 * @returns {string} body HTML fragment
 */
export function markdownToBodyHtml(markdown) {
  const body = renderMarkdown(String(markdown ?? ''));
  if (body.includes('미리보기 내용 없음')) return '<p></p>';
  return body;
}

/**
 * @param {string} markdown
 * @param {string} title
 */
export function markdownToStandaloneHtml(markdown, title) {
  const body = markdownToBodyHtml(markdown);
  const safeTitle = escapeHtml(title || 'NoName');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
${MARKDOWN_EXPORT_CSS}
</style>
</head>
<body>
<div class="markdown-export">${body}</div>
</body>
</html>
`;
}

/**
 * Saves the HTML to a folder the user picks, not into the NAS folder.
 *
 * @param {string} fileName
 * @param {string} markdown
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>} null when cancelled
 */
export function exportMarkdownTextAsHtml(fileName, markdown) {
  const title = getMarkdownFileStem(fileName);
  return saveFileToPickedFolder({
    fileName: exportFileName(title, 'html'),
    base64: encodeTextBase64(markdownToStandaloneHtml(markdown, title)),
    mimeType: 'text/html;charset=utf-8',
    title: 'HTML을 저장할 폴더 선택',
  });
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportMarkdownFileAsHtml(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  return exportMarkdownTextAsHtml(fileName, decodeTextBase64(base64));
}

/**
 * Markdown → standalone HTML → PDF (printed by the host's Chromium).
 *
 * @param {string} fileName
 * @param {string} markdown
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>}
 */
export async function exportMarkdownTextAsPdf(fileName, markdown) {
  const title = getMarkdownFileStem(fileName);
  const { exportHtmlDocumentAsPdf } = await import('../pdf/exportHtmlAsPdf.js');
  return exportHtmlDocumentAsPdf({
    html: markdownToStandaloneHtml(markdown, title),
    title,
  });
}

/**
 * Markdown → same standalone HTML as PDF, opened in the system print dialog.
 *
 * @param {string} fileName
 * @param {string} markdown
 */
export async function printMarkdownText(fileName, markdown) {
  const title = getMarkdownFileStem(fileName);
  const { printHtmlDocument } = await import('../print/printHtmlDocument.js');
  await printHtmlDocument(markdownToStandaloneHtml(markdown, title));
}
