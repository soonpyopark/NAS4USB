import { joinRelativePath, readFileAsBase64, resolveUniqueName, validateFolderName } from './fsPaths.js';
import { isTrashPath } from './trashPaths.js';
import { buildNewFileContent, resolveNewFileName } from './files/newFileFactory.js';
import { convertHwpBase64ToHwpx, isHwpFileName, toHwpxFileName } from '@nas4usb/rhwp/hwpConvert.js';

/**
 * @param {string} targetPath
 */
function assertWritablePath(targetPath) {
  if (isTrashPath(targetPath)) {
    throw new Error('휴지통에는 파일을 추가할 수 없습니다.');
  }
}

/**
 * @param {string} targetPath
 */
async function readSiblingNames(targetPath) {
  const entries = await window.nas4usb.fs.readDir(targetPath);
  return entries.map((entry) => entry.name);
}

/**
 * @param {string} targetPath
 * @param {string} name
 */
export async function createFolderAtPath(targetPath, name) {
  assertWritablePath(targetPath);
  const validation = validateFolderName(name);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const entries = await window.nas4usb.fs.readDir(targetPath);
  const existingNames = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
  const folderName = resolveUniqueName(existingNames, validation.name);
  await window.nas4usb.fs.mkdir(joinRelativePath(targetPath, folderName));
  return folderName;
}

/**
 * @param {string} targetPath
 * @param {string} type
 */
export async function createNewTypedFileAtPath(targetPath, type) {
  assertWritablePath(targetPath);
  const existingNames = await readSiblingNames(targetPath);
  const fileName = resolveNewFileName(existingNames, type);
  const base64 = await buildNewFileContent(type);
  await window.nas4usb.fs.writeFile(joinRelativePath(targetPath, fileName), base64);
  return fileName;
}

/**
 * @param {string} targetPath
 * @param {File[]} files
 * @param {{ onProgress?: (info: { current: number, total: number, fileName: string }) => void }} [options]
 */
export async function uploadFilesAtPath(targetPath, files, options = {}) {
  assertWritablePath(targetPath);
  const list = Array.isArray(files) ? files : [];
  const total = list.length;

  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    options.onProgress?.({
      current: index + 1,
      total,
      fileName: file.name,
    });

    let base64 = await readFileAsBase64(file);
    let targetName = file.name;

    if (isHwpFileName(file.name)) {
      base64 = await convertHwpBase64ToHwpx(base64, file.name);
      targetName = toHwpxFileName(file.name);
    }

    await window.nas4usb.fs.writeFile(joinRelativePath(targetPath, targetName), base64);
  }
}
