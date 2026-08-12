import { parseTiptapFileBase64, readSidecarAssets } from './package.js';
import { toPackageAssetUrl } from './assetUrls.js';
import { getTiptapFileStem } from './document.js';
import { exportFileName } from '../browserDownload.js';
import { encodeTextBase64 } from '../text/textIO.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import {
  buildSharedTiptapExportBody,
  wrapSharedExportHtmlDocument,
} from './buildSharedExport.js';

/**
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportTiptapFileAsHtml(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const parsed = await parseTiptapFileBase64(base64);
  return exportTiptapContentAsHtml({
    relativePath,
    fileName,
    content: parsed.content,
    embeddedAssets: parsed.embeddedAssets,
    title: parsed.title,
  });
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
 * Live TipTap → HTML (same cleaned body as HWPX export).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 */
export async function exportLiveTiptapContentAsHtml(relativePath, fileName, editorOrContent) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  const editor =
    editorOrContent && typeof editorOrContent.getJSON === 'function' ? editorOrContent : null;
  const content = editor ? undefined : editorOrContent;
  return exportTiptapContentAsHtml({
    relativePath,
    fileName,
    content,
    editor,
    embeddedAssets,
  });
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content?: import('@tiptap/core').JSONContent,
 *   editor?: import('@tiptap/core').Editor | null,
 *   embeddedAssets: { path: string, base64: string }[],
 *   title?: string,
 * }} input
 */
async function exportTiptapContentAsHtml(input) {
  const { relativePath, fileName, content, editor = null, embeddedAssets, title: titleInput } =
    input;
  const title =
    (titleInput && titleInput !== 'NoName' ? titleInput : getTiptapFileStem(fileName)) || 'NoName';

  const bodyHtml = buildSharedTiptapExportBody({ content, editor, relativePath });
  const html = wrapSharedExportHtmlDocument({
    bodyHtml,
    title,
    embedAssets: embeddedAssets,
  });

  return saveFileToPickedFolder({
    fileName: exportFileName(title, 'html'),
    base64: encodeTextBase64(html),
    mimeType: 'text/html;charset=utf-8',
    title: 'HTML을 저장할 폴더 선택',
  });
}
