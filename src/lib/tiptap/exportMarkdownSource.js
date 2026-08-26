import { normalizeTiptapAssetUrls } from './assetUrls.js';

/**
 * Live TipTap document as Markdown for kordoc HWPX export.
 * Asset URLs are rewritten to `assets/<file>` so the host can embed sidecars.
 *
 * @param {import('@tiptap/core').Editor} editor
 * @param {string} [relativePath]
 * @returns {string}
 */
export function buildTiptapExportMarkdown(editor, relativePath = '') {
  if (!editor) {
    throw new Error('에디터가 준비되지 않았습니다.');
  }

  const json = relativePath
    ? normalizeTiptapAssetUrls(editor.getJSON(), relativePath)
    : editor.getJSON();

  if (typeof editor.markdown?.serialize === 'function') {
    return String(editor.markdown.serialize(json) ?? '').trim();
  }
  if (typeof editor.getMarkdown === 'function') {
    return String(editor.getMarkdown() ?? '').trim();
  }
  throw new Error('Markdown 변환을 지원하지 않습니다.');
}
