import { exportFileName } from '../browserDownload.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import { decodeTextBase64 } from './textIO.js';
import { getMarkdownFileStem } from './exportMarkdown.js';

/**
 * @param {string} markdown
 * @returns {Promise<string>}
 */
export async function convertMarkdownToHwpxBase64(markdown) {
  const convert = window.nas4usb?.kordoc?.markdownToHwpx;
  if (typeof convert !== 'function') {
    throw new Error('문서 변환을 사용할 수 없습니다. NAS 호스트에 다시 연결해 주세요.');
  }
  const result = await convert({ markdown });
  const base64 = String(result?.hwpxBase64 ?? '');
  if (!base64) {
    throw new Error('HWPX로 변환하지 못했습니다.');
  }
  return base64;
}

/**
 * @param {string} fileName
 * @param {string} markdown
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>}
 */
export async function exportMarkdownTextAsHwpx(fileName, markdown) {
  const hwpxBase64 = await convertMarkdownToHwpxBase64(markdown);
  const title = getMarkdownFileStem(fileName);
  return saveFileToPickedFolder({
    fileName: exportFileName(title, 'hwpx'),
    base64: hwpxBase64,
    mimeType: 'application/haansofthwpx',
    title: 'HWPX를 저장할 폴더 선택',
  });
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportMarkdownFileAsHwpx(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  return exportMarkdownTextAsHwpx(fileName, decodeTextBase64(base64));
}
