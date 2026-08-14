import { buildLiveTiptapExportHtml } from './exportHtml.jsx';
import { exportHtmlDocumentAsPdf } from '../pdf/exportHtmlAsPdf.js';

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
