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
import {
  getSpreadsheetPathForFortuneSidecar,
  isFortuneSidecarRelativePath,
} from '../shared/fortuneSheetSidecar.js';
import { getTiptapAssetSidecarPath } from '../shared/tiptapAssetPaths.js';

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
 * @typedef {import('./settingsService.js').AccessAuth} AccessAuth
 */

/**
 * @param {string} relativePath
 * @param {string | null | undefined} shareToken
 * @param {string} [portableRoot]
 */
/**
 * @param {string} relativePath
 * @param {string} sharedRelativePath
 */
function isPathCoveredByShareLink(relativePath, sharedRelativePath) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const sharedPath = String(sharedRelativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || !sharedPath) return false;
  if (normalizedPath === sharedPath) return true;
  // FortuneSheet sidecar (e.g. report.xlsx.fortune.json) for the shared spreadsheet
  if (isFortuneSidecarRelativePath(normalizedPath)) {
    return getSpreadsheetPathForFortuneSidecar(normalizedPath) === sharedPath;
  }
  // TipTap asset sidecar dir/files (e.g. Note.tiptap.assets/image.png) for the shared TipTap doc
  const tiptapAssetsDir = getTiptapAssetSidecarPath(sharedPath);
  if (normalizedPath === tiptapAssetsDir || normalizedPath.startsWith(`${tiptapAssetsDir}/`)) {
    return true;
  }
  return false;
}

async function canAccessViaShareToken(relativePath, shareToken, portableRoot = getPortableRoot()) {
  if (!shareToken) return false;
  const entry = await resolveShareToken(shareToken, portableRoot);
  if (!entry?.relativePath) return false;
  return isPathCoveredByShareLink(relativePath, entry.relativePath);
}

/**
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function assertCanWriteFs(auth, portableRoot = getPortableRoot()) {
  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
  if (!perms.write) {
    throw new Error(ACCESS_WRITE_DENIED_MESSAGE);
  }
}

/** @deprecated use assertCanWriteFs */
export async function assertGuestCanWrite(auth, portableRoot = getPortableRoot()) {
  return assertCanWriteFs(auth, portableRoot);
}

/**
 * @param {string} relativePath
 * @param {AccessAuth} auth
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanAccessFile(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || normalizedPath === '.') return;

  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
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
 * @param {AccessAuth} auth
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function assertCanEditFile(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);

  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (shareToken) {
    const sharedEntry = await resolveShareToken(shareToken, portableRoot);
    if (sharedEntry && isPathCoveredByShareLink(normalizedPath, sharedEntry.relativePath)) {
      if (sharedEntry.mode === SHARE_LINK_MODE_EDIT) return;
      throw new Error(SHARE_VIEW_ONLY_MESSAGE);
    }
  }

  await assertCanWriteFs(auth, portableRoot);
}

/**
 * @param {string} [relativePath]
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function readDirWithAccessFilter(
  relativePath = '.',
  auth,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '.').replace(/\\/g, '/');
  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
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
 * @param {AccessAuth} auth
 * @param {string | null | undefined} [shareToken]
 * @param {string} [portableRoot]
 */
export async function pathExistsWithAccessFilter(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  try {
    await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);
  } catch {
    return false;
  }
  return fsService.pathExists(relativePath);
}

export async function statPathWithAccessFilter(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);
  return fsService.statPath(relativePath);
}

export async function readFileBase64WithAccessFilter(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);
  return fsService.readFileBase64(relativePath);
}

export async function readFileBufferWithAccessFilter(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);
  return fsService.readFileBuffer(relativePath);
}

/**
 * Any logged-in session (일반사용자 포함).
 * @param {boolean} isAuthenticated
 */
export function assertAdminAuthenticated(isAuthenticated) {
  if (!isAuthenticated) {
    throw new Error('로그인이 필요합니다.');
  }
}

/**
 * 총괄관리자(super_admin) 세션만 허용.
 * @param {boolean} isSuperAdmin
 */
export function assertSuperAdminAuthenticated(isSuperAdmin) {
  if (!isSuperAdmin) {
    throw new Error('환경설정은 총괄관리자만 이용할 수 있습니다.');
  }
}

/**
 * 휴지통: 쓰기 권한이 있는 사용자
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function assertCanAccessTrash(auth, portableRoot = getPortableRoot()) {
  await assertCanWriteFs(auth, portableRoot);
}
