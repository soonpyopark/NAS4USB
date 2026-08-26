import { buildLiveTiptapExportHtml } from './exportHtml.jsx';
import { exportHtmlDocumentAsPdf } from '../pdf/exportHtmlAsPdf.js';
import { printHtmlDocument } from '../print/printHtmlDocument.js';

/**
 * Live TipTap → WYSIWYG PDF (the editor canvas printed by Chromium).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>}
 */
export async function exportLiveTiptapContentAsPdf(relativePath, fileName, editorOrContent) {
  const { title, html } = await buildLiveTiptapExportHtml(relativePath, fileName, editorOrContent);
  return exportHtmlDocumentAsPdf({ html, title });
}

/**
 * Live TipTap → same WYSIWYG HTML as PDF, opened in the system print dialog.
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 */
export async function printLiveTiptapContent(relativePath, fileName, editorOrContent) {
  const { html } = await buildLiveTiptapExportHtml(relativePath, fileName, editorOrContent);
  await printHtmlDocument(html);
}
