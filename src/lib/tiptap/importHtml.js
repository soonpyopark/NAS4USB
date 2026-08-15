import { normalizeOfficeClipboardHtml } from './clipboardHtml.js';
import { rematerializePastedTiptapAssets } from './copyPasteAssets.js';
import { materializePastedImages } from './pasteImages.js';
import { flattenWebDocumentHtml, looksLikeWebDocument } from './importWebHtml.js';

/**
 * Prefer the live editor canvas from a NAS4USB HTML export; otherwise the body.
 * @param {string} html
 */
export function extractImportableHtml(html) {
  const raw = String(html ?? '');
  if (!raw.trim()) return '<p></p>';

  if (typeof document !== 'undefined') {
    const body = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? raw;
    const template = document.createElement('template');
    template.innerHTML = body;
    const editorRoot = template.content.querySelector('.tiptap, .ProseMirror');
    if (editorRoot) {
      return normalizeOfficeClipboardHtml(editorRoot.innerHTML) || '<p></p>';
    }
  }

  return normalizeOfficeClipboardHtml(raw) || '<p></p>';
}

/**
 * Same as `extractImportableHtml`, but a full web page is rendered first so
 * class-based colors and fills survive.
 *
 * @param {string} html
 */
export async function prepareImportableHtml(html) {
  const raw = String(html ?? '');
  if (looksLikeWebDocument(raw)) {
    const rendered = await flattenWebDocumentHtml(raw);
    if (rendered?.trim()) {
      return normalizeOfficeClipboardHtml(rendered) || '<p></p>';
    }
  }
  return extractImportableHtml(raw);
}

/**
 * A document ending in a table or quote leaves nowhere to put the cursor, and
 * ProseMirror warns about a selection outside inline content.
 *
 * @param {string} html
 */
function withTrailingParagraph(html) {
  const value = String(html ?? '').trim();
  if (!value) return '<p></p>';
  return /<\/(table|blockquote|ul|ol|pre|hr|figure|details)>\s*$/i.test(value)
    ? `${value}<p></p>`
    : value;
}

/**
 * Replace the live editor content with an HTML file (images uploaded to sidecar).
 *
 * @param {import('@tiptap/core').Editor} editor
 * @param {File | string} fileOrHtml
 * @param {{
 *   uploadFile?: (file: File) => Promise<string>,
 *   destTiptapPath?: string,
 * }} [options]
 */
export async function importHtmlIntoEditor(editor, fileOrHtml, options = {}) {
  if (!editor) throw new Error('에디터가 준비되지 않았습니다.');

  const raw =
    typeof fileOrHtml === 'string'
      ? fileOrHtml
      : await fileOrHtml.text();
  let cleaned = await prepareImportableHtml(raw);
  if (options.uploadFile) {
    cleaned = await materializePastedImages(cleaned, {
      files: [],
      uploadFile: options.uploadFile,
    });
    if (options.destTiptapPath) {
      cleaned = await rematerializePastedTiptapAssets(cleaned, {
        destTiptapPath: options.destTiptapPath,
        uploadFile: options.uploadFile,
      });
    }
  }
  editor.chain().setContent(withTrailingParagraph(cleaned)).setTextSelection(0).run();
}
