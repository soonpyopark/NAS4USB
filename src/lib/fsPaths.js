import { SHARED_FOLDER, EXTERNAL_FOLDER } from '../../shared/constants.js';
import { HOMES_FOLDER } from '../../shared/memberHomes.js';
import {
  isExternalFolderPath,
  isExternalMountRootPath,
} from '../../shared/externalFolders.js';

/**
 * @param {string} currentPath
 * @param {string} name
 */
export function joinRelativePath(currentPath, name) {
  return currentPath === '.' ? name : `${currentPath}/${name}`;
}

const INVALID_FOLDER_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * @param {string} name
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function validateFolderName(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: '폴더 이름을 입력해 주세요.' };
  }

  const sanitized = trimmed.replace(INVALID_FOLDER_NAME_PATTERN, '').replace(/[. ]+$/g, '');
  if (!sanitized) {
    return { ok: false, error: '사용할 수 없는 문자가 포함되어 있습니다.' };
  }

  if (sanitized === '.' || sanitized === '..') {
    return { ok: false, error: '사용할 수 없는 폴더 이름입니다.' };
  }

  return { ok: true, name: sanitized };
}

/**
 * @param {string} name
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function validateEntryName(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: '이름을 입력해 주세요.' };
  }

  const sanitized = trimmed.replace(INVALID_FOLDER_NAME_PATTERN, '').replace(/[. ]+$/g, '');
  if (!sanitized) {
    return { ok: false, error: '사용할 수 없는 문자가 포함되어 있습니다.' };
  }

  if (sanitized === '.' || sanitized === '..') {
    return { ok: false, error: '사용할 수 없는 이름입니다.' };
  }

  return { ok: true, name: sanitized };
}

export { splitEntryExtension, validateRenameEntryName } from '../../shared/entryNames.js';
export { resolveUniqueName } from '../../shared/uniqueName.js';

/**
 * @param {string} relativePath
 */
export function getParentPath(relativePath) {
  if (relativePath === '.') return '.';
  const parts = relativePath.split('/');
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

/**
 * @param {string} relativePath
 */
export function getBaseName(relativePath) {
  return relativePath.split('/').pop() ?? relativePath;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** @typedef {'name'|'modifiedAt'|'size'|'type'} SortField */
/** @typedef {'asc'|'desc'} SortDirection */

/**
 * Keep 공유폴더 above 개인폴더 at the workspace root (Korean name order would reverse them).
 * @param {string} name
 */
function workspaceRootFolderRank(name, relativePath = '') {
  if (name === SHARED_FOLDER || relativePath === SHARED_FOLDER) return 0;
  if (name === HOMES_FOLDER || relativePath === HOMES_FOLDER) return 1;
  if (name === EXTERNAL_FOLDER || relativePath === EXTERNAL_FOLDER) return 2;
  if (isExternalFolderPath(relativePath) || relativePath.startsWith(`${EXTERNAL_FOLDER}/`)) return 3;
  return 4;
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {SortField} sortField
 * @param {SortDirection} sortDirection
 */
export function sortEntries(entries, sortField, sortDirection) {
  const factor = sortDirection === 'asc' ? 1 : -1;
  // Preserve settings order for external mounts (API list order).
  const indexed = entries.map((entry, index) => ({ entry, index }));

  indexed.sort((left, right) => {
    const a = left.entry;
    const b = right.entry;
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    const rootRank =
      workspaceRootFolderRank(a.name, a.relativePath) -
      workspaceRootFolderRank(b.name, b.relativePath);
    if (rootRank !== 0) return rootRank;

    // External mount roots follow 환경설정 order, not name/date sort.
    if (isExternalMountRootPath(a.relativePath) && isExternalMountRootPath(b.relativePath)) {
      return left.index - right.index;
    }

    switch (sortField) {
      case 'modifiedAt':
        return factor * (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime());
      case 'size':
        return factor * ((a.size ?? 0) - (b.size ?? 0));
      case 'type':
        return factor * (a.extension ?? '').localeCompare(b.extension ?? '', 'ko');
      case 'name':
      default:
        return factor * a.name.localeCompare(b.name, 'ko');
    }
  });

  return indexed.map((item) => item.entry);
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} query
 */
export function filterEntries(entries, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(normalized));
}
