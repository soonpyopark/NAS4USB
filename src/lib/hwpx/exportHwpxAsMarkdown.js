import { exportFileName } from '../browserDownload.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import { encodeTextBase64 } from '../text/textIO.js';
import { getHwpxFileStem } from './exportHwpxDocument.js';

/**
 * @param {string} relativePath
 */
export function isHwpxRelativePath(relativePath) {
  return /\.hwpx$/i.test(String(relativePath || ''));
}

/**
 * @param {string} hwpxBase64
 * @returns {Promise<string>}
 */
export async function convertHwpxBase64ToMarkdown(hwpxBase64) {
  const convert = window.nas4usb?.kordoc?.hwpxToMarkdown;
  if (typeof convert !== 'function') {
    throw new Error('문서 변환을 사용할 수 없습니다. NAS 호스트에 다시 연결해 주세요.');
  }
  const result = await convert({ hwpxBase64 });
  return String(result?.markdown ?? '');
}

/**
 * @param {string} fileName
 * @param {string} hwpxBase64
 * @returns {Promise<import('../saveToFolder.js').SaveResult | null>}
 */
export async function exportHwpxBase64AsMarkdown(fileName, hwpxBase64) {
  const markdown = await convertHwpxBase64ToMarkdown(hwpxBase64);
  const title = getHwpxFileStem(fileName);
  return saveFileToPickedFolder({
    fileName: exportFileName(title, 'md'),
    base64: encodeTextBase64(markdown),
    mimeType: 'text/markdown;charset=utf-8',
    title: 'Markdown을 저장할 폴더 선택',
  });
}

/**
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportHwpxFileAsMarkdown(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  return exportHwpxBase64AsMarkdown(fileName, base64);
}
