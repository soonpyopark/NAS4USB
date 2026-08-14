import { exportFileName } from '../browserDownload.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import { createHttpNas4usbClient } from '../nas4usbClient.js';

/** @type {ReturnType<typeof createHttpNas4usbClient> | null} */
let httpClient = null;

/**
 * The HTML export targets an A3-wide canvas; on A4 the page block must give up
 * its fixed width and tall images must stay inside one sheet.
 */
const A4_PRINT_CSS = `
@media print {
  .tiptap-export-page,
  .markdown-export {
    max-width: none !important;
    padding: 0 !important;
  }
  .tiptap-export-page img,
  .tiptap-export-page video,
  .markdown-export img {
    max-height: 240mm !important;
  }
}
`;

/**
 * @param {string} html
 */
function withPdfPageCss(html) {
  const value = String(html ?? '');
  const style = `<style>${A4_PRINT_CSS}</style>`;
  return value.includes('</head>') ? value.replace('</head>', `${style}</head>`) : `${style}${value}`;
}

/**
 * Ask the host to print a standalone HTML document to PDF.
 *
 * Prefers the Electron bridge and falls back to the LAN HTTP route, so a
 * browser client gets a PDF rendered by the host's Chromium.
 *
 * @param {{
 *   html: string,
 *   fileName: string,
 *   pageSize?: string,
 *   landscape?: boolean,
 *   marginMm?: number,
 *   printBackground?: boolean,
 * }} payload
 * @returns {Promise<{ base64: string, fileName: string }>}
 */
async function renderHtmlToPdf(payload) {
  const bridge = window.nas4usb?.pdf?.fromHtml;
  if (typeof bridge === 'function') {
    return bridge(payload);
  }

  httpClient ??= createHttpNas4usbClient();
  const overHttp = httpClient?.pdf?.fromHtml;
  if (typeof overHttp !== 'function') {
    throw new Error('이 환경에서는 PDF 내보내기를 지원하지 않습니다.');
  }
  return overHttp(payload);
}

/**
 * Print a standalone HTML document to PDF and save it to a folder the user picks.
 *
 * @param {{ html: string, title: string, landscape?: boolean }} input
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>} null when cancelled
 */
export async function exportHtmlDocumentAsPdf({ html, title, landscape = false }) {
  const outName = exportFileName(title || 'NoName', 'pdf');
  const converted = await renderHtmlToPdf({
    html: withPdfPageCss(html),
    fileName: outName,
    pageSize: 'A4',
    landscape,
    marginMm: 12,
    printBackground: true,
  });

  if (!converted?.base64) {
    throw new Error('PDF 변환 결과가 비어 있습니다.');
  }

  return saveFileToPickedFolder({
    fileName: converted.fileName || outName,
    base64: converted.base64,
    mimeType: 'application/pdf',
    title: 'PDF를 저장할 폴더 선택',
  });
}
