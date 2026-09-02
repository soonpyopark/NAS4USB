/**
 * Shared helpers for external-folder (no LAN collab) paths.
 */
import {
  isExternalFolderPath,
  isExternalFolderContainerPath,
  isExternalMountRootPath,
} from '../../shared/externalFolders.js';

/**
 * @param {string | null | undefined} relativePath
 */
export function isExternalWorkspacePath(relativePath) {
  return isExternalFolderPath(String(relativePath ?? ''));
}

/**
 * Collaboration is disabled for external mounts; editors still allow local edit/save.
 * @param {string | null | undefined} relativePath
 * @param {object | null | undefined} syncInfo
 */
export function syncInfoForPath(relativePath, syncInfo) {
  if (isExternalWorkspacePath(relativePath)) return null;
  return syncInfo ?? null;
}

/**
 * Virtual `외부폴더` container or a mount root — settings only; never delete disk as NAS trash.
 * @param {string | null | undefined} relativePath
 */
export function isExternalMountRoot(relativePath) {
  const path = String(relativePath ?? '');
  return isExternalFolderContainerPath(path) || isExternalMountRootPath(path);
}

/**
 * Files/folders inside an external mount (not the container or mount root).
 * Soft-delete (NAS trash) is unsupported — use permanent delete only.
 * @param {string | null | undefined} relativePath
 */
export function isExternalContentPath(relativePath) {
  const path = String(relativePath ?? '');
  return isExternalFolderPath(path) && !isExternalMountRoot(path);
}

export const EXTERNAL_MOUNT_DELETE_HINT =
  '외부폴더 연결은 환경설정 → 일반 → 외부 폴더에서만 해제할 수 있습니다. 원본 파일은 삭제되지 않습니다.';

/**
 * Toolbar 「캐시 정리」 — 외부폴더 트리, 총괄관리자만.
 * @param {string} currentPath
 * @param {boolean} isSuperAdmin
 */
export function canClearExternalOrphanCaches(currentPath, isSuperAdmin) {
  return Boolean(isSuperAdmin && isExternalFolderPath(String(currentPath ?? '')));
}
