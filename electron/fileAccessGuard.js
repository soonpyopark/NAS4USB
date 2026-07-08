import {
  canEditFileEntry,
  canViewFileEntry,
  filterEntriesByFileAccess,
} from '../shared/fileAccessVisibility.js';
import { isTrashRelativePath, TRASH_ACCESS_DENIED_MESSAGE } from '../shared/constants.js';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { getFileAccessMap } from './fileAccessService.js';
import { resolveShareToken } from './shareLinkService.js';
import { SHARE_LINK_MODE_EDIT } from '../shared/shareLinkModes.js';

const ACCESS_DENIED_MESSAGE = '이 파일에 접근할 권한이 없습니다.';
export const EDIT_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';
export const SHARE_VIEW_ONLY_MESSAGE = '공유 링크는 보기 전용입니다.';

/**
 * @param {string} relativePath
 * @param {boolean} isAdminAuthenticated
 * @param {string | null | undefined} shareToken
 * @param {string} [portableRoot]
 */
async function canAccessViaShareToken(relativePath, shareToken, portableRoot = getPortableRoot()) {
  if (!shareToken) return false;
  const entry = await resolveShareToken(shareToken, portableRoot);
  return entry?.relativePath === String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 * @param {boolean} isAdminAuthenticated
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanAccessFile(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') return;

  if (isTrashRelativePath(normalizedPath) && !isAdminAuthenticated) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }

  // 유효한 공유 링크(보기/편집)는 비공개·열람제한과 무관하게 열람 허용
  if (await canAccessViaShareToken(normalizedPath, shareToken, portableRoot)) {
    return;
  }

  const accessMap = await getFileAccessMap(portableRoot);
  if (!canViewFileEntry(normalizedPath, accessMap, isAdminAuthenticated)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
}

/**
 * @param {string} relativePath
 * @param {boolean} isAdminAuthenticated
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanEditFile(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isAdminAuthenticated, shareToken, portableRoot);

  if (isAdminAuthenticated) return;

  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (shareToken) {
    const sharedEntry = await resolveShareToken(shareToken, portableRoot);
    if (sharedEntry?.relativePath === normalizedPath) {
      // 공유(편집 가능): 비공개·열람제한과 무관하게 편집 허용
      if (sharedEntry.mode === SHARE_LINK_MODE_EDIT) return;
      throw new Error(SHARE_VIEW_ONLY_MESSAGE);
    }
  }

  const accessMap = await getFileAccessMap(portableRoot);
  if (!canEditFileEntry(normalizedPath, accessMap, isAdminAuthenticated)) {
    throw new Error(EDIT_DENIED_MESSAGE);
  }
}

/**
 * @param {string} [relativePath]
 * @param {boolean} isAdminAuthenticated
 * @param {string} [portableRoot]
 */
export async function readDirWithAccessFilter(
  relativePath = '.',
  isAdminAuthenticated,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '.').replace(/\\/g, '/');
  if (isTrashRelativePath(normalizedPath) && !isAdminAuthenticated) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }

  const entries = await fsService.readDir(relativePath);
  if (isAdminAuthenticated) return entries;

  const accessMap = await getFileAccessMap(portableRoot);
  return filterEntriesByFileAccess(entries, accessMap, isAdminAuthenticated);
}

/**
 * @param {string} relativePath
 * @param {boolean} isAdminAuthenticated
 * @param {string} [portableRoot]
 */
export async function pathExistsWithAccessFilter(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  try {
    await assertCanAccessFile(relativePath, isAdminAuthenticated, shareToken, portableRoot);
  } catch {
    return false;
  }
  return fsService.pathExists(relativePath);
}

export async function statPathWithAccessFilter(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isAdminAuthenticated, shareToken, portableRoot);
  return fsService.statPath(relativePath);
}

export async function readFileBase64WithAccessFilter(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isAdminAuthenticated, shareToken, portableRoot);
  return fsService.readFileBase64(relativePath);
}

export async function readFileBufferWithAccessFilter(
  relativePath,
  isAdminAuthenticated,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isAdminAuthenticated, shareToken, portableRoot);
  return fsService.readFileBuffer(relativePath);
}

/**
 * @param {boolean} isAdminAuthenticated
 */
export function assertAdminAuthenticated(isAdminAuthenticated) {
  if (!isAdminAuthenticated) {
    throw new Error('총괄관리자 권한이 필요합니다.');
  }
}

/**
 * @param {boolean} isAdminAuthenticated
 */
export function assertCanAccessTrash(isAdminAuthenticated) {
  if (!isAdminAuthenticated) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }
}
