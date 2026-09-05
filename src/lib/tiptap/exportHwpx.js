import { Editor } from '@tiptap/core';
import { parseTiptapFileBase64, readSidecarAssets } from './package.js';
import { packageAssetUrlToFileName, toPackageAssetUrl } from './assetUrls.js';
import { getTiptapFileStem } from './document.js';
import { createTiptapExtensions } from './extensions.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';
import { exportMarkdownTextAsHwpx } from '../text/exportMarkdownAsHwpx.js';

/**
 * @param {unknown} editorOrContent
 * @returns {import('@tiptap/core').JSONContent | null}
 */
function resolveContentJson(editorOrContent) {
  if (!editorOrContent) return null;
  if (typeof editorOrContent.getJSON === 'function') {
    return editorOrContent.getJSON();
  }
  return /** @type {import('@tiptap/core').JSONContent} */ (editorOrContent);
}

/**
 * @param {string} markdown
 * @param {{ path: string, base64: string }[]} embeddedAssets
 */
function inlineMarkdownAssetImages(markdown, embeddedAssets) {
  if (!embeddedAssets.length) return markdown;

  /** @type {Map<string, string>} */
  const dataUrlByFileName = new Map();
  for (const asset of embeddedAssets) {
    const fileName = packageAssetUrlToFileName(asset.path) ?? asset.path.split('/').pop();
    if (!fileName) continue;
    dataUrlByFileName.set(
      fileName,
      `data:${guessMimeFromFileName(fileName)};base64,${asset.base64}`,
    );
  }

  return String(markdown ?? '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, src) => {
    const raw = String(src ?? '').trim();
    const fileName =
      packageAssetUrlToFileName(raw) ??
      (raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw);
    const dataUrl = fileName ? dataUrlByFileName.get(fileName) : null;
    return dataUrl ? `![${alt}](${dataUrl})` : full;
  });
}

/**
 * @param {import('@tiptap/core').JSONContent} content
 */
function serializeTiptapJsonToMarkdown(content) {
  const host = document.createElement('div');
  const editor = new Editor({
    element: host,
    extensions: createTiptapExtensions({
      includeImageNodeView: false,
      includeMediaNodeView: false,
      enableSuggestionUi: false,
    }),
    content,
    editable: false,
  });
  try {
    return String(editor.getMarkdown?.() ?? '');
  } finally {
    editor.destroy();
    host.remove();
  }
}

/**
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 * @param {{ path: string, base64: string }[]} embeddedAssets
 */
export function tiptapContentToMarkdown(editorOrContent, embeddedAssets = []) {
  let markdown = '';
  if (typeof editorOrContent?.getMarkdown === 'function') {
    markdown = String(editorOrContent.getMarkdown() ?? '');
  }
  if (!markdown.trim()) {
    const content = resolveContentJson(editorOrContent);
    if (!content) {
      throw new Error('내보낼 TipTap 문서가 없습니다.');
    }
    markdown = serializeTiptapJsonToMarkdown(content);
  }
  if (!markdown.trim()) {
    throw new Error('내보낼 Markdown이 비어 있습니다.');
  }
  return inlineMarkdownAssetImages(markdown, embeddedAssets);
}

/**
 * @param {string} relativePath
 */
async function loadLiveEmbeddedAssets(relativePath) {
  const sidecarAssets = await readSidecarAssets(relativePath);
  return sidecarAssets.map((asset) => ({
    path: toPackageAssetUrl(asset.fileName),
    base64: asset.base64,
  }));
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 */
export async function exportLiveTiptapContentAsHwpx(relativePath, fileName, editorOrContent) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  const markdown = tiptapContentToMarkdown(editorOrContent, embeddedAssets);
  return exportMarkdownTextAsHwpx(getTiptapFileStem(fileName), markdown);
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportTiptapFileAsHwpx(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const parsed = await parseTiptapFileBase64(base64);
  const markdown = tiptapContentToMarkdown(parsed.content, parsed.embeddedAssets);
  return exportMarkdownTextAsHwpx(parsed.title || getTiptapFileStem(fileName), markdown);
}
