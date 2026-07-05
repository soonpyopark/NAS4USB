import {
  canEditFileEntry,
  canViewFileEntry,
  filterEntriesByFileAccess,
} from '../shared/fileAccessVisibility.js';
import { getPortableRoot } from './appContext.js';
import * as fsService from './fsService.js';
import { getFileAccessMap } from './fileAccessService.js';
import { resolveShareToken } from './shareLinkService.js';

const ACCESS_DENIED_MESSAGE = '이 파일에 접근할 권한이 없습니다.';
export const EDIT_DENIED_MESSAGE = '공개된 문서만 편집할 수 있습니다.';

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

  const accessMap = await getFileAccessMap(portableRoot);
  const normalizedPath = String(relativePath ?? '').replace(/\\/g, '/');
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
