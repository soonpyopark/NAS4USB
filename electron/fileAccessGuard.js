import {
  canViewFileEntry,
  filterEntriesByFileAccess,
} from '../shared/fileAccessVisibility.js';
import { isTrashRelativePath, TRASH_ACCESS_DENIED_MESSAGE } from '../shared/constants.js';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { getFileAccessMap } from './fileAccessService.js';
import { getEffectiveAccessPermissions } from './settingsService.js';
import { resolveShareToken } from './shareLinkService.js';
import { SHARE_LINK_MODE_EDIT } from '../shared/shareLinkModes.js';

const ACCESS_DENIED_MESSAGE = '이 파일에 접근할 권한이 없습니다.';
export const EDIT_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';
export const SHARE_VIEW_ONLY_MESSAGE = '공유 링크는 보기 전용입니다.';
export const ACCESS_VIEW_DENIED_MESSAGE = '보기 권한이 없습니다.';
export const ACCESS_READ_DENIED_MESSAGE = '읽기 권한이 없습니다.';
export const ACCESS_WRITE_DENIED_MESSAGE = '쓰기 권한이 없습니다.';
/** @deprecated */
export const GUEST_VIEW_DENIED_MESSAGE = ACCESS_VIEW_DENIED_MESSAGE;
/** @deprecated */
export const GUEST_READ_DENIED_MESSAGE = ACCESS_READ_DENIED_MESSAGE;
/** @deprecated */
export const GUEST_WRITE_DENIED_MESSAGE = ACCESS_WRITE_DENIED_MESSAGE;

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
 * @param {boolean} isLoggedIn
 * @param {string} [portableRoot]
 */
export async function assertCanWriteFs(isLoggedIn, portableRoot = getPortableRoot()) {
  const perms = await getEffectiveAccessPermissions(isLoggedIn, portableRoot);
  if (!perms.write) {
    throw new Error(ACCESS_WRITE_DENIED_MESSAGE);
  }
}

/** @deprecated use assertCanWriteFs */
export async function assertGuestCanWrite(isLoggedIn, portableRoot = getPortableRoot()) {
  return assertCanWriteFs(isLoggedIn, portableRoot);
}

/**
 * @param {string} relativePath
 * @param {boolean} isLoggedIn
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanAccessFile(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') return;

  const perms = await getEffectiveAccessPermissions(isLoggedIn, portableRoot);
  const elevatedAccess = Boolean(perms.write);

  if (isTrashRelativePath(normalizedPath) && !elevatedAccess) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }

  if (await canAccessViaShareToken(normalizedPath, shareToken, portableRoot)) {
    return;
  }

  if (!elevatedAccess && !perms.read) {
    throw new Error(ACCESS_READ_DENIED_MESSAGE);
  }

  const accessMap = await getFileAccessMap(portableRoot);
  if (!canViewFileEntry(normalizedPath, accessMap, elevatedAccess)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
}

/**
 * @param {string} relativePath
 * @param {boolean} isLoggedIn
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanEditFile(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isLoggedIn, shareToken, portableRoot);

  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (shareToken) {
    const sharedEntry = await resolveShareToken(shareToken, portableRoot);
    if (sharedEntry?.relativePath === normalizedPath) {
      if (sharedEntry.mode === SHARE_LINK_MODE_EDIT) return;
      throw new Error(SHARE_VIEW_ONLY_MESSAGE);
    }
  }

  await assertCanWriteFs(isLoggedIn, portableRoot);
}

/**
 * @param {string} [relativePath]
 * @param {boolean} isLoggedIn
 * @param {string} [portableRoot]
 */
export async function readDirWithAccessFilter(
  relativePath = '.',
  isLoggedIn,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '.').replace(/\\/g, '/');
  const perms = await getEffectiveAccessPermissions(isLoggedIn, portableRoot);
  const elevatedAccess = Boolean(perms.write);

  if (isTrashRelativePath(normalizedPath) && !elevatedAccess) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }

  if (elevatedAccess) {
    return fsService.readDir(relativePath);
  }

  if (!perms.view) {
    return [];
  }

  const entries = await fsService.readDir(relativePath);
  const accessMap = await getFileAccessMap(portableRoot);
  return filterEntriesByFileAccess(entries, accessMap, false);
}

/**
 * @param {string} relativePath
 * @param {boolean} isLoggedIn
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function pathExistsWithAccessFilter(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  try {
    await assertCanAccessFile(relativePath, isLoggedIn, shareToken, portableRoot);
  } catch {
    return false;
  }
  return fsService.pathExists(relativePath);
}

export async function statPathWithAccessFilter(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isLoggedIn, shareToken, portableRoot);
  return fsService.statPath(relativePath);
}

export async function readFileBase64WithAccessFilter(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isLoggedIn, shareToken, portableRoot);
  return fsService.readFileBase64(relativePath);
}

export async function readFileBufferWithAccessFilter(
  relativePath,
  isLoggedIn,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, isLoggedIn, shareToken, portableRoot);
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
 * 휴지통: 쓰기 권한이 있는 사용자(일반/로그인)
 * @param {boolean} isLoggedIn
 * @param {string} [portableRoot]
 */
export async function assertCanAccessTrash(isLoggedIn, portableRoot = getPortableRoot()) {
  await assertCanWriteFs(isLoggedIn, portableRoot);
}
