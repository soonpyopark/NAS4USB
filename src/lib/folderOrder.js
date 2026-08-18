import {
  isFixedFolderOrderPath,
  resolveFolderOrderParent,
} from '../../shared/folderOrder.js';
import { sortEntries } from './fsPaths.js';

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} parentPath
 * @param {Record<string, string[]> | null | undefined} folderOrderMap
 * @param {string | null | undefined} [loginId]
 */
export function sortEntriesByFolderOrder(entries, parentPath, folderOrderMap, loginId) {
  const key = resolveFolderOrderParent(parentPath, loginId, entries?.[0]?.relativePath);
  const names = folderOrderMap?.[key] ?? [];
  return sortEntries(entries, 'custom', 'asc', names);
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string[] | null | undefined} savedNames
 */
/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 */
export function folderOrderKey(entry) {
  return entry.name;
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 */
export function favoriteOrderKey(entry) {
  return entry.relativePath;
}

/**
 * @typedef {{ includeFixed?: boolean, pinWorkspaceRoots?: boolean }} FolderOrderOptions
 */

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string[] | null | undefined} savedNames
 * @param {(entry: import('../types/nas4usb.d.ts').FsEntry) => string} [getKey]
 * @param {FolderOrderOptions} [options]
 */
export function materializeFolderOrder(entries, savedNames, getKey = folderOrderKey, options) {
  const sorted = sortEntries(entries, 'custom', 'asc', savedNames, {
    pinWorkspaceRoots: options?.pinWorkspaceRoots,
  });
  return sorted
    .filter((entry) => options?.includeFixed || !isFixedFolderOrderPath(entry.relativePath))
    .map((entry) => getKey(entry));
}

/**
 * Keep the same slot when only the display key (file/folder name or favorite
 * path) changes. Inserts `toKey` at `fromKey`'s index and drops the old key.
 * @param {string[]} names
 * @param {string} fromKey
 * @param {string} toKey
 */
export function renameFolderOrderKey(names, fromKey, toKey) {
  const list = Array.isArray(names) ? names.slice() : [];
  if (!fromKey || !toKey || fromKey === toKey) return list;
  const index = list.indexOf(fromKey);
  if (index === -1) return list;
  const next = list.filter((name) => name !== toKey);
  const writeAt = Math.min(index, next.length);
  if (next[writeAt] !== toKey) next.splice(writeAt, 0, toKey);
  const fromIndex = next.indexOf(fromKey);
  if (fromIndex !== -1) next.splice(fromIndex, 1);
  return next;
}

/**
 * Snapshot the current list order and swap the renamed item's key in place.
 * `entries` should already be in the order the user sees.
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} fromKey
 * @param {string} toKey
 * @param {(entry: import('../types/nas4usb.d.ts').FsEntry) => string} [getKey]
 * @param {FolderOrderOptions} [options]
 */
export function folderOrderNamesAfterRename(
  entries,
  fromKey,
  toKey,
  getKey = folderOrderKey,
  options,
) {
  return folderOrderNamesAfterRenames(entries, [{ fromKey, toKey }], getKey, options);
}

/**
 * Same as `folderOrderNamesAfterRename` for several name/path changes
 * (password lock/unlock adds or strips `.sec`).
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {Array<{ fromKey: string, toKey: string }>} renames
 * @param {(entry: import('../types/nas4usb.d.ts').FsEntry) => string} [getKey]
 * @param {FolderOrderOptions} [options]
 */
export function folderOrderNamesAfterRenames(
  entries,
  renames,
  getKey = folderOrderKey,
  options,
) {
  let next = materializeFolderOrder(
    entries,
    (entries || []).map((entry) => getKey(entry)),
    getKey,
    options,
  );
  for (const rename of renames || []) {
    next = renameFolderOrderKey(next, rename.fromKey, rename.toKey);
  }
  return next;
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {(entry: import('../types/nas4usb.d.ts').FsEntry) => string} [getKey]
 */
export function folderOrderKindByName(entries, getKey = folderOrderKey) {
  /** @type {Map<string, 'dir' | 'file'>} */
  const map = new Map();
  for (const entry of entries) {
    map.set(getKey(entry), entry.isDirectory ? 'dir' : 'file');
  }
  return map;
}

/**
 * @param {string[]} names
 * @param {string} name
 * @param {number} delta
 * @param {Map<string, 'dir' | 'file'>} kindByName
 */
export function moveFolderOrderName(names, name, delta, kindByName) {
  const step = delta < 0 ? -1 : 1;
  const from = names.indexOf(name);
  if (from < 0) return names;
  const kind = kindByName.get(name);
  let to = from + step;
  while (to >= 0 && to < names.length && kindByName.get(names[to]) !== kind) {
    to += step;
  }
  if (to < 0 || to >= names.length) return names;
  const next = names.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string[] | null | undefined} savedNames
 * @param {string} name
 * @param {number} delta
 */
export function canMoveFolderOrder(
  entries,
  savedNames,
  name,
  delta,
  getKey = folderOrderKey,
  options,
) {
  const names = materializeFolderOrder(entries, savedNames, getKey, options);
  const next = moveFolderOrderName(names, name, delta, folderOrderKindByName(entries, getKey));
  return next.some((item, index) => item !== names[index]);
}

/**
 * @param {string[]} names
 * @param {string[]} movingNames
 * @param {string} targetName
 * @param {'before' | 'after'} place
 * @param {Map<string, 'dir' | 'file'>} kindByName
 */
export function placeFolderOrderNames(names, movingNames, targetName, place, kindByName) {
  const moving = movingNames.filter((name) => names.includes(name));
  if (moving.length === 0) return names;
  const kind = kindByName.get(moving[0]);
  if (!kind || moving.some((name) => kindByName.get(name) !== kind)) return names;
  if (kindByName.get(targetName) !== kind) return names;
  const movingSet = new Set(moving);
  if (movingSet.has(targetName)) return names;

  const orderedMoving = names.filter((name) => movingSet.has(name));
  const next = names.filter((name) => !movingSet.has(name));
  let index = next.indexOf(targetName);
  if (index < 0) return names;
  if (place === 'after') index += 1;
  next.splice(index, 0, ...orderedMoving);
  return next;
}
