import { EXTERNAL_FOLDER } from './constants.js';
import { normalizeRelativePath } from './memberHomes.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   absolutePath: string,
 * }} ExternalFolderMount
 */

/**
 * Reorder mounts for explorer display. Indices are clamped; no-op if unchanged.
 * @param {ExternalFolderMount[]} folders
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {ExternalFolderMount[]}
 */
export function moveExternalFolder(folders, fromIndex, toIndex) {
  const list = Array.isArray(folders) ? [...folders] : [];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length ||
    from === to
  ) {
    return list;
  }
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
}

/**
 * Stable short id from an absolute path (renderer-safe, no node:crypto).
 * @param {string} absolutePath
 */
export function makeExternalMountId(absolutePath) {
  const normalized = String(absolutePath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `e${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * @param {string} absolutePath
 */
export function defaultExternalFolderLabel(absolutePath) {
  const normalized = String(absolutePath ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  const base = normalized.split('/').filter(Boolean).pop() || normalized;
  // Windows drive root → "D:"
  if (/^[a-zA-Z]:$/.test(base)) return `${base.toUpperCase()} 드라이브`;
  if (/^[a-zA-Z]:$/.test(normalized)) return `${normalized.toUpperCase()} 드라이브`;
  return base || '외부폴더';
}

/**
 * Display name for explorer (alias). Empty → folder basename default.
 * @param {unknown} value
 * @param {string} absolutePath
 */
export function sanitizeExternalFolderLabel(value, absolutePath) {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return trimmed || defaultExternalFolderLabel(absolutePath);
}

/**
 * @param {unknown} value
 * @returns {ExternalFolderMount[]}
 */
export function normalizeExternalFolders(value) {
  if (!Array.isArray(value)) return [];
  /** @type {Map<string, ExternalFolderMount>} */
  const byId = new Map();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const absolutePath = String(raw.absolutePath ?? raw.path ?? '').trim();
    if (!absolutePath) continue;
    const id =
      typeof raw.id === 'string' && /^e[0-9a-f]+$/i.test(raw.id.trim())
        ? raw.id.trim()
        : makeExternalMountId(absolutePath);
    const aliasOrLabel =
      (typeof raw.alias === 'string' && raw.alias.trim() ? raw.alias : null) ??
      (typeof raw.label === 'string' && raw.label.trim() ? raw.label : null);
    const label = sanitizeExternalFolderLabel(aliasOrLabel, absolutePath);
    byId.set(id, { id, label, absolutePath });
  }
  // Keep settings / UI order (Map insertion order). Do not sort by label.
  return [...byId.values()];
}

/**
 * Virtual container only: `외부폴더` (not mounts or deeper files).
 * @param {string} relativePath
 */
export function isExternalFolderContainerPath(relativePath) {
  return normalizeRelativePath(relativePath) === EXTERNAL_FOLDER;
}

/**
 * @param {string} relativePath
 */
export function isExternalFolderPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return (
    normalized === EXTERNAL_FOLDER || normalized.startsWith(`${EXTERNAL_FOLDER}/`)
  );
}

/**
 * Mount root only: `외부폴더/<id>` (not deeper files).
 * @param {string} relativePath
 */
export function isExternalMountRootPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.startsWith(`${EXTERNAL_FOLDER}/`)) return false;
  const rest = normalized.slice(EXTERNAL_FOLDER.length + 1);
  return Boolean(rest) && !rest.includes('/');
}

/**
 * @param {string} relativePath
 * @returns {{ mountId: string, rest: string } | null}
 */
export function splitExternalFolderPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.startsWith(`${EXTERNAL_FOLDER}/`)) return null;
  const after = normalized.slice(EXTERNAL_FOLDER.length + 1);
  if (!after) return null;
  const slash = after.indexOf('/');
  if (slash < 0) return { mountId: after, rest: '' };
  return { mountId: after.slice(0, slash), rest: after.slice(slash + 1) };
}

/**
 * @param {string} mountId
 * @param {string} [rest]
 */
export function joinExternalFolderPath(mountId, rest = '') {
  const id = String(mountId || '').trim();
  const tail = normalizeRelativePath(rest);
  if (!id) return EXTERNAL_FOLDER;
  return tail ? `${EXTERNAL_FOLDER}/${id}/${tail}` : `${EXTERNAL_FOLDER}/${id}`;
}
