import { Editor } from '@tiptap/core';
import { parseTiptapFileBase64, readSidecarAssets } from './package.js';
import {
  packageAssetUrlToFileName,
  normalizeTiptapAssetUrls,
  toPackageAssetUrl,
} from './assetUrls.js';
import { getTiptapFileStem } from './document.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';
import { getParentPath, joinRelativePath, resolveUniqueName } from '../fsPaths.js';
import { createTiptapExtensions } from './extensions.js';
import { convertHtmlToHwpxBase64 } from '../rhwp/htmlToHwpx.js';

/**
 * @param {string} sourceRelativePath
 * @param {string} title
 * @param {string} hwpxBase64
 * @returns {Promise<{ relativePath: string, name: string }>}
 */
async function writeHwpxBesideSource(sourceRelativePath, title, hwpxBase64) {
  if (!window.nas4usb?.fs?.writeFile || !window.nas4usb?.fs?.readDir) {
    throw new Error('파일 저장 API를 사용할 수 없습니다.');
  }

  const parentPath = getParentPath(sourceRelativePath);
  const desiredName = `${String(title || 'NoName').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.hwpx`;
  const entries = await window.nas4usb.fs.readDir(parentPath);
  const existingNames = (Array.isArray(entries) ? entries : []).map((entry) => entry.name);
  const uniqueName = resolveUniqueName(existingNames, desiredName);
  const relativePath = joinRelativePath(parentPath, uniqueName);
  await window.nas4usb.fs.writeFile(relativePath, hwpxBase64);
  return { relativePath, name: uniqueName };
}

/**
 * TipTap JSON → HTML fragment suitable for rhwp pasteHtml.
 * Resolves package asset URLs to data URLs when possible.
 *
 * @param {{
 *   relativePath: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets?: { path: string, base64: string }[],
 * }} input
 */
export async function tiptapContentToExportHtml({ relativePath, content, embeddedAssets = [] }) {
  const dataUrlByFileName = new Map();
  for (const asset of embeddedAssets) {
    const assetFileName = packageAssetUrlToFileName(asset.path) ?? asset.path;
    dataUrlByFileName.set(
      assetFileName,
      `data:${guessMimeFromFileName(assetFileName)};base64,${asset.base64}`,
    );
  }

  const normalizedContent = normalizeTiptapAssetUrls(content, relativePath);

  function rewriteSrc(url) {
    const assetFileName = packageAssetUrlToFileName(url);
    if (assetFileName && dataUrlByFileName.has(assetFileName)) {
      return dataUrlByFileName.get(assetFileName);
    }
    return url;
  }

  const rewritten = rewriteAssetSrcInContent(normalizedContent, rewriteSrc);

  const editor = new Editor({
    extensions: createTiptapExtensions({
      collaboration: null,
      enableSuggestionUi: false,
      includeImageNodeView: false,
      includeMediaNodeView: false,
      placeholder: '',
    }),
    content: rewritten,
    editable: false,
  });

  try {
    return editor.getHTML() || '<p><br></p>';
  } finally {
    editor.destroy();
  }
}

/**
 * Recursively rewrite image/media src attrs in TipTap JSON.
 * @param {import('@tiptap/core').JSONContent} node
 * @param {(url: string) => string} rewriteSrc
 */
function rewriteAssetSrcInContent(node, rewriteSrc) {
  if (!node || typeof node !== 'object') return node;
  /** @type {import('@tiptap/core').JSONContent} */
  const next = { ...node };
  if (next.attrs && typeof next.attrs.src === 'string') {
    next.attrs = { ...next.attrs, src: rewriteSrc(next.attrs.src) };
  }
  if (Array.isArray(next.content)) {
    next.content = next.content.map((child) => rewriteAssetSrcInContent(child, rewriteSrc));
  }
  return next;
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
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets?: { path: string, base64: string }[],
 *   title?: string,
 *   html?: string,
 * }} input
 */
async function exportTiptapContentAsHwpx(input) {
  const title =
    (input.title && input.title !== 'NoName' ? input.title : getTiptapFileStem(input.fileName)) ||
    'NoName';

  const html =
    input.html ??
    (await tiptapContentToExportHtml({
      relativePath: input.relativePath,
      content: input.content,
      embeddedAssets: input.embeddedAssets ?? [],
    }));

  const hwpxBase64 = await convertHtmlToHwpxBase64(html);
  return writeHwpxBesideSource(input.relativePath, title, hwpxBase64);
}

/**
 * Export open TipTap editor content as `.hwpx` beside the source file.
 * Builds HTML from JSON + sidecar assets (data URLs) so images survive pasteHtml.
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').JSONContent} content
 */
export async function exportLiveTiptapContentAsHwpx(relativePath, fileName, content) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  return exportTiptapContentAsHwpx({
    relativePath,
    fileName,
    content,
    embeddedAssets,
  });
}

/**
 * Read a `.tiptap` file from disk and export as `.hwpx`.
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportTiptapFileAsHwpx(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const parsed = await parseTiptapFileBase64(base64);
  return exportTiptapContentAsHwpx({
    relativePath,
    fileName,
    content: parsed.content,
    embeddedAssets: parsed.embeddedAssets,
    title: parsed.title,
  });
}
