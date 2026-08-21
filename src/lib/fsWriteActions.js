import { joinRelativePath, readFileAsBase64, resolveUniqueName, validateFolderName } from './fsPaths.js';
import { uploadFileToPath } from './uploadFileToPath.js';
import { isTrashPath } from './trashPaths.js';
import { buildNewFileContent, resolveNewFileName } from './files/newFileFactory.js';
import { convertHwpBase64ToHwpx, isHwpFileName, toHwpxFileName } from '@nas4usb/rhwp/hwpConvert.js';
import { isOnenoteFileName } from './onenote/fileNames.js';
import { importOnenoteToFolder } from './onenote/importOnenoteToFolder.js';

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
  const folderName = resolveUniqueName(existingNames, validation.name, true);
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
 * @param {File} file
 */
function uploadRelativePath(file) {
  const rel = String(file.webkitRelativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return rel || file.name;
}

/**
 * @param {string} relativePath
 * @param {Map<string, string>} rootRename
 */
function remapUploadPath(relativePath, rootRename) {
  const parts = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (!parts.length) return relativePath;
  const renamed = rootRename.get(parts[0]);
  if (renamed) parts[0] = renamed;
  return parts.join('/');
}

/**
 * @param {string} relativePath
 * @param {Set<string>} dirs
 */
function addAncestorDirs(relativePath, dirs) {
  const parts = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length; i += 1) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    dirs.add(acc);
  }
}

/**
 * @param {string} targetPath
 * @param {File[]} files
 * @param {{
 *   onProgress?: (info: { current: number, total: number, fileName: string }) => void,
 *   emptyDirs?: string[],
 * }} [options]
 */
export async function uploadFilesAtPath(targetPath, files, options = {}) {
  assertWritablePath(targetPath);
  const list = Array.isArray(files) ? files : [];
  const emptyDirs = Array.isArray(options.emptyDirs) ? options.emptyDirs : [];
  const total = list.length;
  /** @type {string | null} */
  let openPath = null;

  const existing = await readSiblingNames(targetPath);
  const used = new Set(existing);
  /** @type {Map<string, string>} */
  const rootRename = new Map();
  const folderRoots = new Set();
  for (const file of list) {
    const rel = uploadRelativePath(file);
    if (rel.includes('/')) folderRoots.add(rel.split('/')[0]);
  }
  for (const dir of emptyDirs) {
    const root = String(dir)
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)[0];
    if (root) folderRoots.add(root);
  }
  for (const root of folderRoots) {
    if (!used.has(root)) {
      used.add(root);
      continue;
    }
    const unique = resolveUniqueName([...used], root, true);
    rootRename.set(root, unique);
    used.add(unique);
  }

  const dirsToCreate = new Set();
  for (const dir of emptyDirs) {
    const remapped = remapUploadPath(dir, rootRename);
    if (remapped) addAncestorDirs(remapped, dirsToCreate);
  }
  for (const file of list) {
    const remapped = remapUploadPath(uploadRelativePath(file), rootRename);
    const parent = remapped.split('/').slice(0, -1).join('/');
    if (parent) addAncestorDirs(parent, dirsToCreate);
  }
  const sortedDirs = [...dirsToCreate].sort((left, right) => left.split('/').length - right.split('/').length);
  for (const dir of sortedDirs) {
    await window.nas4usb.fs.mkdir(joinRelativePath(targetPath, dir));
  }

  const totalBytes = list.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  let completedBytes = 0;

  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    const remapped = remapUploadPath(uploadRelativePath(file), rootRename);
    options.onProgress?.({
      current: index + 1,
      total,
      fileName: remapped || file.name,
      bytes: completedBytes,
      totalBytes,
    });

    if (isOnenoteFileName(file.name)) {
      const oneBase64 = await readFileAsBase64(file);
      const destParent = remapped.includes('/')
        ? joinRelativePath(targetPath, remapped.split('/').slice(0, -1).join('/'))
        : targetPath;
      const siblings = await readSiblingNames(destParent);
      const destName = remapped.split('/').pop() || file.name;
      if (!siblings.includes(destName)) {
        await window.nas4usb.fs.writeFile(joinRelativePath(targetPath, remapped), oneBase64);
      }
      const imported = await importOnenoteToFolder(
        destParent,
        { name: destName, base64: oneBase64 },
        { keepOriginal: false },
      );
      if (imported?.firstFilePath && !openPath) openPath = imported.firstFilePath;
      completedBytes += Number(file.size) || 0;
      continue;
    }

    let destRel = remapped;

    if (isHwpFileName(file.name)) {
      let base64 = await readFileAsBase64(file);
      base64 = await convertHwpBase64ToHwpx(base64, file.name);
      const parts = destRel.split('/');
      parts[parts.length - 1] = toHwpxFileName(parts[parts.length - 1] || file.name);
      destRel = parts.join('/');
      await window.nas4usb.fs.writeFile(joinRelativePath(targetPath, destRel), base64);
    } else {
      await uploadFileToPath(joinRelativePath(targetPath, destRel), file, {
        onByteProgress: ({ bytes }) => {
          options.onProgress?.({
            current: index + 1,
            total,
            fileName: remapped || file.name,
            bytes: completedBytes + bytes,
            totalBytes,
          });
        },
      });
    }

    completedBytes += Number(file.size) || 0;
    options.onProgress?.({
      current: index + 1,
      total,
      fileName: remapped || file.name,
      bytes: completedBytes,
      totalBytes,
    });
  }

  return { openPath };
}
