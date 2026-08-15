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
export function materializeFolderOrder(entries, savedNames) {
  const sorted = sortEntries(entries, 'custom', 'asc', savedNames);
  return sorted
    .filter((entry) => !isFixedFolderOrderPath(entry.relativePath))
    .map((entry) => entry.name);
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 */
export function folderOrderKindByName(entries) {
  /** @type {Map<string, 'dir' | 'file'>} */
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.name, entry.isDirectory ? 'dir' : 'file');
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
export function canMoveFolderOrder(entries, savedNames, name, delta) {
  const names = materializeFolderOrder(entries, savedNames);
  const next = moveFolderOrderName(names, name, delta, folderOrderKindByName(entries));
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
