import {
  canViewFileEntry,
  filterEntriesByFileAccess,
} from '../shared/fileAccessVisibility.js';
import {
  isTrashRelativePath,
  EXTERNAL_FOLDER,
  SHARED_FOLDER,
  TRASH_ACCESS_DENIED_MESSAGE,
  TRASH_FOLDER,
} from '../shared/constants.js';
import {
  displayHomeEntryName,
  filterEntriesByMemberHome,
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isProtectedHomesSystemPath,
  isUnderHomesFolder,
  LEGACY_HOMES_DISK_DIR,
  LEGACY_HOMES_FOLDER,
  memberHomeRelativePath,
  resolveHomeAuth,
  resolveHomePathAccess,
  rewritePathIntoOwnHome,
} from '../shared/memberHomes.js';
import {
  isProtectedSharedSystemPath,
  isWorkspaceRootPath,
} from '../shared/workspacePaths.js';
import { canChangeFolderOrder, resolveFolderOrderParent } from '../shared/folderOrder.js';
import {
  isExternalFolderPath,
  isExternalFolderContainerPath,
  isExternalMountRootPath,
  joinExternalFolderPath,
} from '../shared/externalFolders.js';
import { getExternalFolders, getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { getFileAccessMap } from './fileAccessService.js';
import { getEffectiveAccessPermissions } from './settingsService.js';
import { resolveShareToken } from './shareLinkService.js';
import { getTrashMap } from './trashService.js';
import { SHARE_LINK_MODE_EDIT } from '../shared/shareLinkModes.js';
import {
  getSpreadsheetPathForFortuneSidecar,
  isFortuneSidecarRelativePath,
} from '../shared/fortuneSheetSidecar.js';
import {
  getPdfPathForViewerSidecar,
  isPdfViewerSidecarRelativePath,
} from '../shared/pdfViewerSidecar.js';
import { pruneOrphanPdfViewerSidecars } from './pdfViewerSidecarService.js';
import { getTiptapAssetSidecarPath } from '../shared/tiptapAssetPaths.js';

const ACCESS_DENIED_MESSAGE = '이 파일에 접근할 권한이 없습니다.';
export const EDIT_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';
export const SHARE_VIEW_ONLY_MESSAGE = '공유 링크는 보기 전용입니다.';
export const ACCESS_VIEW_DENIED_MESSAGE = '보기 권한이 없습니다.';
export const ACCESS_READ_DENIED_MESSAGE = '읽기 권한이 없습니다.';
export const ACCESS_WRITE_DENIED_MESSAGE = '쓰기 권한이 없습니다.';
export const HOME_SYSTEM_PROTECTED_MESSAGE =
  '개인 폴더 영역은 이름을 바꾸거나 삭제할 수 없습니다.';
export const HOME_ROOT_RENAME_DENIED_MESSAGE = '개인 폴더의 이름은 바꿀 수 없습니다.';
export const SHARED_SYSTEM_PROTECTED_MESSAGE =
  '공유폴더는 이름을 바꾸거나 삭제할 수 없습니다.';
export const WORKSPACE_ROOT_WRITE_DENIED_MESSAGE =
  '워크스페이스 루트에는 항목을 만들 수 없습니다. 공유폴더·개인폴더·외부폴더를 이용해 주세요.';
export const EXTERNAL_MOUNT_PROTECTED_MESSAGE =
  '외부폴더 연결은 환경설정에서만 추가·제거할 수 있습니다. 원본 파일은 삭제되지 않습니다.';
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
 * @param {string} sharedRelativePath
 */
function isPathCoveredByShareLink(relativePath, sharedRelativePath) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  const sharedPath = String(sharedRelativePath ?? '').replace(/\\/g, '/');
  if (!normalizedPath || !sharedPath) return false;
  if (normalizedPath === sharedPath) return true;
  if (isFortuneSidecarRelativePath(normalizedPath)) {
    return getSpreadsheetPathForFortuneSidecar(normalizedPath) === sharedPath;
  }
  if (isPdfViewerSidecarRelativePath(normalizedPath)) {
    return getPdfPathForViewerSidecar(normalizedPath) === sharedPath;
  }
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
 */
function homeAuthFrom(auth) {
  if (typeof auth === 'boolean') return auth;
  return {
    isLoggedIn: Boolean(auth?.isLoggedIn),
    loginId: auth?.loginId ?? null,
    role: auth?.role ?? null,
  };
}

/**
 * @param {AccessAuth} auth
 */
export function isSuperAdminAuth(auth) {
  return homeAuthFrom(auth).role === 'super_admin';
}

/**
 * 외부폴더는 총괄관리자 전용. 회원 보기/읽기/쓰기는 공유폴더에만 적용.
 * @param {AccessAuth} auth
 */
function assertSuperAdminExternalAccess(auth) {
  if (!isSuperAdminAuth(auth)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
}

/**
 * @param {string} relativePath
 * @param {AccessAuth} auth
 */
export function resolveHomeScopedWritePath(relativePath, auth) {
  const home = homeAuthFrom(auth);
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (!home.isLoggedIn || !home.loginId) return normalized;
  return rewritePathIntoOwnHome(normalized, home.loginId);
}

/**
 * Bulk history wipe is allowed on 공유폴더 / 개인폴더 trees only.
 * Does not use assertCanEditFile — that blocks the folder roots themselves.
 * @param {string} relativePath
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 * @returns {Promise<string>} rewritten folder prefix to clear
 */
export async function assertCanClearFileHistoryTree(
  relativePath,
  auth,
  portableRoot = getPortableRoot(),
) {
  const target = resolveHomeScopedWritePath(relativePath, auth);
  const normalized = String(target ?? '').replace(/\\/g, '/');
  const allowed =
    normalized === SHARED_FOLDER ||
    normalized.startsWith(`${SHARED_FOLDER}/`) ||
    isUnderHomesFolder(normalized);

  if (!allowed) {
    throw new Error('공유폴더와 개인폴더에서만 백업을 일괄 제거할 수 있습니다.');
  }
  if (isHomesContainerPath(normalized)) {
    throw new Error('개인폴더 백업을 지우려면 로그인이 필요합니다.');
  }

  await assertCanAccessFile(normalized, auth, null, portableRoot);
  await assertCanWriteFs(auth, portableRoot, normalized);
  return normalized;
}

/**
 * External-folder orphan cache sweep — super admin only.
 * @param {AccessAuth} auth
 */
export function assertCanClearExternalOrphanCaches(auth) {
  assertSuperAdminExternalAccess(auth);
}

/**
 * Orphan cache sweep for 외부폴더 / 공유폴더 / 개인폴더.
 * @param {string} relativePath
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 * @returns {Promise<string>} rewritten folder prefix to clear
 */
export async function assertCanClearOrphanCaches(
  relativePath,
  auth,
  portableRoot = getPortableRoot(),
) {
  const target = resolveHomeScopedWritePath(relativePath, auth);
  const normalized = String(target ?? '').replace(/\\/g, '/');
  if (isExternalFolderPath(normalized)) {
    assertSuperAdminExternalAccess(auth);
    return normalized;
  }
  return assertCanClearFileHistoryTree(normalized, auth, portableRoot);
}

/**
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 * @param {string} [relativePath] when set, owner/super_admin write is allowed on their home
 */
export async function assertCanWriteFs(auth, portableRoot = getPortableRoot(), relativePath) {
  if (relativePath) {
    const homeAccess = resolveHomePathAccess(relativePath, homeAuthFrom(auth));
    if (homeAccess === 'allow') return;
    if (homeAccess === 'deny') {
      throw new Error(ACCESS_WRITE_DENIED_MESSAGE);
    }
    if (isExternalFolderPath(relativePath)) {
      if (isSuperAdminAuth(auth)) return;
      throw new Error(ACCESS_WRITE_DENIED_MESSAGE);
    }
  }

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
  if (isWorkspaceRootPath(normalizedPath)) return;
  if (normalizedPath === SHARED_FOLDER) return;

  if (await canAccessViaShareToken(normalizedPath, shareToken, portableRoot)) {
    return;
  }

  const homeAccess = resolveHomePathAccess(normalizedPath, homeAuthFrom(auth));
  if (homeAccess === 'deny') {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
  if (homeAccess === 'allow') {
    return;
  }

  if (isExternalFolderPath(normalizedPath)) {
    assertSuperAdminExternalAccess(auth);
    return;
  }

  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
  const elevatedAccess = Boolean(perms.write);
  const home = homeAuthFrom(auth);
  const canUseLimitedTrash = Boolean(home.isLoggedIn && home.loginId);

  if (isTrashRelativePath(normalizedPath) && !elevatedAccess && !canUseLimitedTrash) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }
  if (isTrashRelativePath(normalizedPath) && (elevatedAccess || canUseLimitedTrash)) {
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
/**
 * Block rename/delete of `__homes` and personal home roots.
 * @param {string} relativePath
 * @param {'mutate' | 'rename-source'} [mode]
 */
export function assertHomeSystemPathMutable(relativePath, mode = 'mutate') {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (isWorkspaceRootPath(normalizedPath)) {
    throw new Error(WORKSPACE_ROOT_WRITE_DENIED_MESSAGE);
  }
  if (isProtectedSharedSystemPath(normalizedPath)) {
    throw new Error(SHARED_SYSTEM_PROTECTED_MESSAGE);
  }
  if (isProtectedHomesSystemPath(normalizedPath)) {
    throw new Error(HOME_SYSTEM_PROTECTED_MESSAGE);
  }
  if (isExternalMountRootPath(normalizedPath) || isExternalFolderContainerPath(normalizedPath)) {
    throw new Error(EXTERNAL_MOUNT_PROTECTED_MESSAGE);
  }
  if (mode === 'rename-source' && isMemberHomeRootPath(normalizedPath)) {
    throw new Error(HOME_ROOT_RENAME_DENIED_MESSAGE);
  }
  if (mode === 'mutate' && isMemberHomeRootPath(normalizedPath)) {
    throw new Error(HOME_SYSTEM_PROTECTED_MESSAGE);
  }
}

/**
 * @param {AccessAuth} auth
 */
function buildWorkspaceRootEntries(auth) {
  const home = homeAuthFrom(auth);
  const homeAccess = resolveHomePathAccess(HOMES_FOLDER, home);
  /** @type {Array<{ name: string, relativePath: string, isDirectory: boolean, size: number, modifiedAt: string, extension: null }>} */
  const entries = [
    {
      name: SHARED_FOLDER,
      relativePath: SHARED_FOLDER,
      isDirectory: true,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      extension: null,
    },
  ];
  if (homeAccess === 'allow') {
    entries.push({
      name: HOMES_FOLDER,
      relativePath: HOMES_FOLDER,
      isDirectory: true,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      extension: null,
    });
  }
  if (isSuperAdminAuth(auth)) {
    entries.push({
      name: EXTERNAL_FOLDER,
      relativePath: EXTERNAL_FOLDER,
      isDirectory: true,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      extension: null,
    });
  }
  return entries;
}

/**
 * Mounts listed under the virtual `외부폴더` container (settings order).
 */
function buildExternalMountEntries() {
  return getExternalFolders().map((mount) => ({
    name: mount.label,
    relativePath: joinExternalFolderPath(mount.id),
    isDirectory: true,
    size: 0,
    modifiedAt: new Date(0).toISOString(),
    extension: null,
  }));
}

/**
 * @param {Array<{ name: string, relativePath: string }>} entries
 * @param {string} parentPath
 */
function filterInternalSharedEntries(entries, parentPath) {
  const normalizedParent = String(parentPath ?? '').replace(/\\/g, '/');
  if (normalizedParent !== SHARED_FOLDER) return entries;
  return entries.filter((entry) => {
    const name = entry.name;
    return (
      name !== TRASH_FOLDER &&
      name !== HOMES_FOLDER &&
      name !== LEGACY_HOMES_FOLDER &&
      name !== HOMES_DISK_DIR &&
      name !== LEGACY_HOMES_DISK_DIR
    );
  });
}

export async function assertCanEditFile(
  relativePath,
  auth,
  shareToken,
  portableRoot = getPortableRoot(),
) {
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
  if (isWorkspaceRootPath(normalizedPath)) {
    throw new Error(WORKSPACE_ROOT_WRITE_DENIED_MESSAGE);
  }
  if (isProtectedSharedSystemPath(normalizedPath)) {
    throw new Error(SHARED_SYSTEM_PROTECTED_MESSAGE);
  }
  if (isProtectedHomesSystemPath(normalizedPath)) {
    throw new Error(HOME_SYSTEM_PROTECTED_MESSAGE);
  }
  if (isExternalMountRootPath(normalizedPath)) {
    throw new Error(EXTERNAL_MOUNT_PROTECTED_MESSAGE);
  }
  if (isExternalFolderContainerPath(normalizedPath)) {
    throw new Error(EXTERNAL_MOUNT_PROTECTED_MESSAGE);
  }

  await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);

  if (shareToken) {
    const sharedEntry = await resolveShareToken(shareToken, portableRoot);
    if (sharedEntry && isPathCoveredByShareLink(normalizedPath, sharedEntry.relativePath)) {
      if (sharedEntry.mode === SHARE_LINK_MODE_EDIT) return;
      throw new Error(SHARE_VIEW_ONLY_MESSAGE);
    }
  }

  await assertCanWriteFs(auth, portableRoot, normalizedPath);
}

export const FOLDER_ORDER_DENIED_MESSAGE =
  '폴더 순서는 총괄관리자 또는 본인 개인폴더에서만 변경할 수 있습니다.';

/**
 * @param {string} relativePath
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function assertCanChangeFolderOrder(
  relativePath,
  auth,
  portableRoot = getPortableRoot(),
) {
  const home = resolveHomeAuth(homeAuthFrom(auth));
  const resolvedPath = resolveFolderOrderParent(relativePath, home.loginId);
  if (!canChangeFolderOrder(resolvedPath, home)) {
    throw new Error(FOLDER_ORDER_DENIED_MESSAGE);
  }
  await assertCanAccessFile(resolvedPath, auth, null, portableRoot);
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
  const home = homeAuthFrom(auth);

  if (isWorkspaceRootPath(normalizedPath)) {
    const rootEntries = buildWorkspaceRootEntries(auth);
    const perms = await getEffectiveAccessPermissions(auth, portableRoot);
    if (!perms.view && !perms.write) {
      return rootEntries.filter((entry) => {
        if (isExternalFolderPath(entry.relativePath)) return true;
        return resolveHomePathAccess(entry.relativePath, home) === 'allow';
      });
    }
    return rootEntries;
  }

  if (isExternalFolderContainerPath(normalizedPath)) {
    await assertCanAccessFile(normalizedPath, auth, null, portableRoot);
    return buildExternalMountEntries();
  }

  if (normalizedPath && normalizedPath !== '.') {
    await assertCanAccessFile(normalizedPath, auth, null, portableRoot);
  }

  if (normalizedPath && normalizedPath !== '.') {
    // 목록을 막지 않는다. 시작 시 전체 정리도 이미 한 번 한다.
    void pruneOrphanPdfViewerSidecars(normalizedPath, { recursive: false }).catch(() => {});
  }

  if (isHomesContainerPath(normalizedPath)) {
    const homePath = memberHomeRelativePath(home.loginId);
    if (!homePath) return [];
    const { ensureMemberHome } = await import('./memberHomeService.js');
    await ensureMemberHome(home.loginId);
    void pruneOrphanPdfViewerSidecars(homePath, { recursive: false }).catch(() => {});
    const homeEntries = await fsService.readDir(homePath);
    return filterEntriesByMemberHome(homeEntries, home).map((entry) => ({
      ...entry,
      name: displayHomeEntryName(entry.name, entry.relativePath),
    }));
  }

  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
  const elevatedAccess = Boolean(perms.write);
  const canUseLimitedTrash = Boolean(home.isLoggedIn && home.loginId);

  if (isTrashRelativePath(normalizedPath) && !elevatedAccess && !canUseLimitedTrash) {
    throw new Error(TRASH_ACCESS_DENIED_MESSAGE);
  }

  const entries = filterInternalSharedEntries(
    await fsService.readDir(relativePath),
    normalizedPath,
  );
  const homeFiltered = filterEntriesByMemberHome(entries, home).map((entry) => ({
    ...entry,
    name: displayHomeEntryName(entry.name, entry.relativePath),
  }));

  // Own home (and super_admin on any home): full listing regardless of global flags.
  if (normalizedPath && normalizedPath !== '.') {
    const homeAccess = resolveHomePathAccess(normalizedPath, home);
    if (homeAccess === 'allow') {
      return homeFiltered;
    }
  }

  // Trash: hide items that originated from homes the caller cannot access.
  if (isTrashRelativePath(normalizedPath) && (elevatedAccess || canUseLimitedTrash)) {
    const trashMap = filterTrashMapByHomeAccess(await getTrashMap(portableRoot), auth);
    return homeFiltered.filter((entry) => trashMap[entry.relativePath]);
  }

  if (!elevatedAccess && !perms.view) {
    return homeFiltered.filter((entry) => {
      const access = resolveHomePathAccess(entry.relativePath, home);
      return access === 'allow';
    });
  }

  if (elevatedAccess) {
    return homeFiltered;
  }

  const accessMap = await getFileAccessMap(portableRoot);
  return filterEntriesByFileAccess(homeFiltered, accessMap, false);
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
  if (isWorkspaceRootPath(relativePath) || String(relativePath ?? '').replace(/\\/g, '/') === SHARED_FOLDER) {
    return true;
  }
  if (isExternalFolderContainerPath(relativePath)) {
    return isSuperAdminAuth(auth);
  }
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
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (
    isWorkspaceRootPath(normalized) ||
    normalized === SHARED_FOLDER ||
    normalized === HOMES_FOLDER ||
    isExternalFolderContainerPath(normalized)
  ) {
    await assertCanAccessFile(relativePath, auth, shareToken, portableRoot);
    return {
      name: normalized === '.' || !normalized ? '홈' : normalized.split('/').pop(),
      relativePath: normalized === '.' || !normalized ? '.' : normalized,
      isDirectory: true,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      extension: null,
    };
  }
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
 * 휴지통: 전역 쓰기 권한, 또는 로그인 회원(개인 폴더 삭제분 복원용).
 * @param {AccessAuth} auth
 * @param {string} [portableRoot]
 */
export async function assertCanAccessTrash(auth, portableRoot = getPortableRoot()) {
  const perms = await getEffectiveAccessPermissions(auth, portableRoot);
  if (perms.write) return;
  const home = homeAuthFrom(auth);
  if (home.isLoggedIn && home.loginId) return;
  throw new Error(ACCESS_WRITE_DENIED_MESSAGE);
}

/**
 * Hide trash items whose original path is outside the caller's home visibility.
 * @param {Record<string, { originalPath?: string }>} trashMap
 * @param {AccessAuth} auth
 */
export function filterTrashMapByHomeAccess(trashMap, auth) {
  const home = homeAuthFrom(auth);
  return Object.fromEntries(
    Object.entries(trashMap ?? {}).filter(([, meta]) => {
      const originalPath = String(meta?.originalPath ?? '');
      if (!originalPath) return true;
      return resolveHomePathAccess(originalPath, home) !== 'deny';
    }),
  );
}

/**
 * Hide 외부폴더 favorites from everyone except the super admin.
 * @param {Record<string, unknown>} map
 * @param {AccessAuth} auth
 */
export function filterFavoritesMapForAuth(map, auth) {
  const source = map && typeof map === 'object' ? map : {};
  if (isSuperAdminAuth(auth)) return source;
  return Object.fromEntries(
    Object.entries(source).filter(([relativePath]) => !isExternalFolderPath(relativePath)),
  );
}

/**
 * @param {Array<{ relativePath?: string }>} entries
 * @param {AccessAuth} auth
 */
export function filterFavoriteEntriesForAuth(entries, auth) {
  const list = Array.isArray(entries) ? entries : [];
  if (isSuperAdminAuth(auth)) return list;
  return list.filter((entry) => !isExternalFolderPath(entry?.relativePath));
}
