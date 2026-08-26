import { readSidecarAssets } from './package.js';
import { getTiptapFileStem } from './document.js';
import { exportFileName } from '../browserDownload.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import { buildTiptapExportMarkdown } from './exportMarkdownSource.js';

/**
 * @param {string} relativePath
 * @returns {Promise<{ fileName: string, base64: string }[]>}
 */
async function loadExportAssets(relativePath) {
  const sidecarAssets = await readSidecarAssets(relativePath);
  return sidecarAssets.map((asset) => ({
    fileName: asset.fileName,
    base64: asset.base64,
  }));
}

/**
 * TipTap live editor → Markdown → HWPX (kordoc on the host).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor} editor
 * @returns {Promise<{ fileName: string, absolutePath?: string, downloaded?: boolean } | null>}
 */
export async function exportLiveTiptapContentAsHwpx(relativePath, fileName, editor) {
  if (!editor) {
    throw new Error('에디터가 준비되지 않았습니다.');
  }
  if (!window.nas4usb?.tiptap?.exportHwpx) {
    throw new Error('이 환경에서는 HWPX 내보내기를 지원하지 않습니다.');
  }

  const title = getTiptapFileStem(fileName) || 'document';
  const markdown = buildTiptapExportMarkdown(editor, relativePath);
  if (!markdown) {
    throw new Error('내보낼 내용이 없습니다.');
  }
  const assets = await loadExportAssets(relativePath);
  const outName = exportFileName(title, 'hwpx');

  const converted = await window.nas4usb.tiptap.exportHwpx({
    markdown,
    fileName: outName,
    assets,
  });

  if (!converted?.base64) {
    throw new Error('HWPX 변환 결과가 비어 있습니다.');
  }

  return saveFileToPickedFolder({
    fileName: converted.fileName || outName,
    base64: converted.base64,
    mimeType: 'application/octet-stream',
    title: 'HWPX를 저장할 폴더 선택',
  });
}
