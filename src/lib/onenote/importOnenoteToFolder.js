import { joinRelativePath, readFileAsBase64, resolveUniqueName, validateFolderName } from '../fsPaths.js';
import { showAppChoice } from '../nativeDialog.js';
import { convertOnenoteFile } from './convertOnenote.js';
import { isOnenoteFileName, onenoteStem } from './fileNames.js';

/**
 * @param {string} targetPath
 * @param {string} folderName
 */
async function folderExists(targetPath, folderName) {
  try {
    const entries = await window.nas4usb.fs.readDir(targetPath);
    return entries.some((entry) => entry.isDirectory && entry.name === folderName);
  } catch {
    return false;
  }
}

/**
 * @param {string} folderPath
 */
async function firstTiptapInFolder(folderPath) {
  try {
    const entries = await window.nas4usb.fs.readDir(folderPath);
    const files = entries
      .filter((entry) => !entry.isDirectory && /\.tiptap$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'ko'));
    return files[0] ? joinRelativePath(folderPath, files[0]) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} targetPath
 * @param {string} desiredName
 */
async function uniqueFolderName(targetPath, desiredName) {
  const validation = validateFolderName(desiredName);
  const name = validation.ok ? validation.name : 'OneNote';
  try {
    const entries = await window.nas4usb.fs.readDir(targetPath);
    const existing = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
    return resolveUniqueName(existing, name);
  } catch {
    return name;
  }
}

/**
 * Convert a OneNote file to `{stem}/*.tiptap` next to the upload/open location.
 *
 * @param {string} targetPath
 * @param {File | { name: string, base64: string }} fileOrPayload
 * @param {{
 *   keepOriginal?: boolean,
 *   originalBase64?: string,
 *   confirmExisting?: boolean,
 * }} [options]
 * @returns {Promise<{ folderPath: string, firstFilePath: string, fileCount: number } | null>}
 */
export async function importOnenoteToFolder(targetPath, fileOrPayload, options = {}) {
  const fileName = fileOrPayload.name || 'section.one';
  if (!isOnenoteFileName(fileName)) {
    throw new Error('원노트 .one / .onepkg 파일만 가져올 수 있습니다.');
  }
  const stem = onenoteStem(fileName);
  const validation = validateFolderName(stem);
  const folderName = validation.ok ? validation.name : 'OneNote';
  const existingFolder = await folderExists(targetPath, folderName);
  const folderPath = joinRelativePath(targetPath, folderName);

  if (existingFolder && options.confirmExisting !== false) {
    const existingFirst = await firstTiptapInFolder(folderPath);
    const choice = await showAppChoice({
      title: '원노트 가져오기',
      body: `'${folderName}' 폴더가 이미 있습니다. 다시 변환할까요?`,
      primaryLabel: '다시 변환',
      secondaryLabel: existingFirst ? '기존 파일 열기' : '취소',
      cancelLabel: '취소',
    });
    if (choice === 'secondary' && existingFirst) {
      return { folderPath, firstFilePath: existingFirst, fileCount: 0 };
    }
    if (choice !== 'primary') return null;
  }

  const base64 =
    'base64' in fileOrPayload && fileOrPayload.base64
      ? fileOrPayload.base64
      : await readFileAsBase64(/** @type {File} */ (fileOrPayload));

  const converted = await convertOnenoteFile({ base64, fileName });
  const pages = converted?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('원노트에서 페이지를 찾지 못했습니다.');
  }

  const { packOnenotePagesToTiptap } = await import('../tiptap/importOnenote.js');
  const packed = await packOnenotePagesToTiptap(pages);
  const writeFolderName = existingFolder ? folderName : await uniqueFolderName(targetPath, folderName);
  const writeFolderPath = joinRelativePath(targetPath, writeFolderName);
  await window.nas4usb.fs.mkdir(writeFolderPath);

  let existingNames = [];
  try {
    existingNames = (await window.nas4usb.fs.readDir(writeFolderPath)).map((entry) => entry.name);
  } catch {
    existingNames = [];
  }

  /** @type {string | null} */
  let firstFilePath = null;
  for (const page of packed) {
    const name = existingFolder ? page.fileName : resolveUniqueName(existingNames, page.fileName);
    existingNames.push(name);
    const relativePath = joinRelativePath(writeFolderPath, name);
    await window.nas4usb.fs.writeFile(relativePath, page.base64);
    if (!firstFilePath) firstFilePath = relativePath;
  }

  if (options.keepOriginal) {
    const originalBase64 = options.originalBase64 || base64;
    const siblings = (await window.nas4usb.fs.readDir(targetPath)).map((entry) => entry.name);
    if (!siblings.includes(fileName)) {
      await window.nas4usb.fs.writeFile(joinRelativePath(targetPath, fileName), originalBase64);
    }
  }

  if (!firstFilePath) throw new Error('변환된 TipTap 파일을 만들지 못했습니다.');
  return { folderPath: writeFolderPath, firstFilePath, fileCount: packed.length };
}

/**
 * Convert an on-disk `.one` next to a sibling folder of `.tiptap` pages.
 *
 * @param {{ relativePath: string, name?: string }} entry
 */
export async function importOnenoteEntry(entry) {
  const relativePath = entry.relativePath;
  const fileName = entry.name || relativePath.split('/').pop() || 'section.one';
  const parent = relativePath.includes('/')
    ? relativePath.slice(0, relativePath.lastIndexOf('/'))
    : '.';
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  return importOnenoteToFolder(parent, { name: fileName, base64 }, { keepOriginal: false });
}
