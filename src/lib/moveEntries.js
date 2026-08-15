import { getParentPath, joinRelativePath, resolveUniqueName } from './fsPaths.js';
import { sortEntriesByFolderOrder } from './folderOrder.js';
import { filterTiptapAssetSidecarFromEntries } from '../../shared/tiptapAssetPaths.js';
import { isTrashPath, TRASH_FOLDER } from './trashPaths.js';

/**
 * @param {string} relativePath
 */
export function formatDataPath(relativePath) {
  if (relativePath === '.') return '워크스페이스';
  return relativePath.replace(/\\/g, '/');
}

/**
 * @param {string} ancestorPath
 * @param {string} candidatePath
 */
export function isPathInsideOrEqual(ancestorPath, candidatePath) {
  if (ancestorPath === '.') return true;
  return candidatePath === ancestorPath || candidatePath.startsWith(`${ancestorPath}/`);
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} destinationPath
 */
export function validateExportDestination(entries, destinationPath) {
  if (!entries.length) {
    return { ok: false, error: '내보낼 항목을 선택해 주세요.' };
  }
  if (isTrashPath(destinationPath)) {
    return { ok: false, error: '휴지통에는 저장할 수 없습니다.' };
  }
  return { ok: true };
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} destinationPath
 */
export function validateMoveDestination(entries, destinationPath) {
  if (!entries.length) {
    return { ok: false, error: '이동할 항목을 선택해 주세요.' };
  }

  if (isTrashPath(destinationPath)) {
    return { ok: false, error: '휴지통으로는 이동할 수 없습니다. 삭제(휴지통) 메뉴를 사용해 주세요.' };
  }

  for (const entry of entries) {
    if (isTrashPath(entry.relativePath)) {
      return { ok: false, error: '휴지통 항목은 이동할 수 없습니다. 복원 메뉴를 사용해 주세요.' };
    }

    if (entry.relativePath === destinationPath) {
      return { ok: false, error: '항목을 자기 자신으로 이동할 수 없습니다.' };
    }

    if (entry.isDirectory && isPathInsideOrEqual(entry.relativePath, destinationPath)) {
      return { ok: false, error: '폴더를 자신 또는 하위 폴더로 이동할 수 없습니다.' };
    }
  }

  return { ok: true };
}

/**
 * @param {string} folderPath
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 */
export function isBlockedMoveFolder(folderPath, entries) {
  return entries.some(
    (entry) => entry.isDirectory && isPathInsideOrEqual(entry.relativePath, folderPath),
  );
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} destinationPath
 * @returns {Promise<Array<{ from: string, to: string, entry: import('../types/nas4usb.d.ts').FsEntry }>>}
 */
export async function moveEntries(entries, destinationPath) {
  const validation = validateMoveDestination(entries, destinationPath);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const dirEntries = await window.nas4usb.fs.readDir(destinationPath);
  const names = new Set(dirEntries.map((entry) => entry.name));
  /** @type {Array<{ from: string, to: string, entry: import('../types/nas4usb.d.ts').FsEntry }>} */
  const results = [];

  for (const entry of entries) {
    const parent = getParentPath(entry.relativePath);
    const uniqueName = resolveUniqueName(names, entry.name, entry.isDirectory);
    const destination = joinRelativePath(destinationPath, uniqueName);

    if (parent === destinationPath && uniqueName === entry.name) {
      continue;
    }

    names.add(uniqueName);
    await window.nas4usb.fs.move(entry.relativePath, destination);
    results.push({ from: entry.relativePath, to: destination, entry });
  }

  return results;
}

/**
 * @param {string} relativePath
 */
export async function listMoveDestinationFolders(relativePath) {
  const entries = await window.nas4usb.fs.readDir(relativePath);
  const folders = filterTiptapAssetSidecarFromEntries(
    entries.filter((entry) => entry.isDirectory && entry.relativePath !== TRASH_FOLDER),
  );
  /** @type {Record<string, string[]>} */
  let orderMap = {};
  try {
    orderMap = (await window.nas4usb.folderOrder?.getMap?.()) ?? {};
  } catch {
    orderMap = {};
  }
  return sortEntriesByFolderOrder(folders, relativePath, orderMap);
}
