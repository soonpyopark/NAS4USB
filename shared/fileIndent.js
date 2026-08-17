export const MAX_FILE_INDENT = 8;
export const FILE_INDENT_STEP_PX = 32;

/**
 * @param {unknown} value
 */
export function normalizeFileIndent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_FILE_INDENT, Math.round(n)));
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function normalizeFileLevelMap(raw) {
  /** @type {Record<string, number>} */
  const levels = {};
  if (!raw || typeof raw !== 'object') return levels;
  for (const [key, value] of Object.entries(raw)) {
    const level = normalizeFileIndent(value);
    if (level > 0) levels[String(key).replace(/\\/g, '/')] = level;
  }
  return levels;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, true>}
 */
export function normalizeFileCollapsedMap(raw) {
  /** @type {Record<string, true>} */
  const collapsed = {};
  if (!raw || typeof raw !== 'object') return collapsed;
  for (const [key, value] of Object.entries(raw)) {
    if (value) collapsed[String(key).replace(/\\/g, '/')] = true;
  }
  return collapsed;
}

/**
 * @param {{ isDirectory?: boolean, relativePath?: string }[] | null | undefined} entries
 */
export function fileEntriesInOrder(entries) {
  return (entries || []).filter((entry) => entry && !entry.isDirectory && entry.relativePath);
}

/**
 * @param {{ isDirectory?: boolean, relativePath?: string } | null | undefined} entry
 * @param {Record<string, number> | null | undefined} levelMap
 */
export function entryIndent(entry, levelMap) {
  if (!entry || entry.isDirectory || !entry.relativePath) return 0;
  return normalizeFileIndent(levelMap?.[entry.relativePath]);
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} files
 * @param {number} index
 * @param {Record<string, number> | null | undefined} levelMap
 */
export function descendantFilePaths(files, index, levelMap) {
  const current = files[index];
  if (!current) return [];
  const level = entryIndent(current, levelMap);
  /** @type {string[]} */
  const out = [];
  for (let i = index + 1; i < files.length; i += 1) {
    const nextLevel = entryIndent(files[i], levelMap);
    if (nextLevel <= level) break;
    out.push(files[i].relativePath);
  }
  return out;
}

/**
 * OneNote: a page can move down one level only when the previous page can be its parent.
 * @param {{ relativePath: string, isDirectory?: boolean }[]} files
 * @param {number} index
 * @param {Record<string, number> | null | undefined} levelMap
 */
export function canDemoteFile(files, index, levelMap) {
  if (index <= 0) return false;
  const current = files[index];
  if (!current) return false;
  const level = entryIndent(current, levelMap);
  if (level >= MAX_FILE_INDENT) return false;
  return level <= entryIndent(files[index - 1], levelMap);
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} files
 * @param {number} index
 * @param {Record<string, number> | null | undefined} levelMap
 */
export function canPromoteFile(files, index, levelMap) {
  const current = files[index];
  if (!current) return false;
  return entryIndent(current, levelMap) > 0;
}

/**
 * Move a file and its descendants by one indent step.
 * @param {{ relativePath: string, isDirectory?: boolean }[]} files
 * @param {number} index
 * @param {1 | -1} delta
 * @param {Record<string, number> | null | undefined} levelMap
 * @returns {{ path: string, level: number }[]}
 */
export function planIndentDelta(files, index, delta, levelMap) {
  if (delta !== 1 && delta !== -1) return [];
  if (delta > 0 && !canDemoteFile(files, index, levelMap)) return [];
  if (delta < 0 && !canPromoteFile(files, index, levelMap)) return [];
  const current = files[index];
  if (!current) return [];
  const paths = [current.relativePath, ...descendantFilePaths(files, index, levelMap)];
  return paths.map((path) => ({
    path,
    level: normalizeFileIndent((levelMap?.[path] || 0) + delta),
  }));
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} files
 * @param {number} index
 * @param {Record<string, number> | null | undefined} levelMap
 * @param {Record<string, boolean> | null | undefined} collapsedMap
 */
export function isFileHiddenByCollapse(files, index, levelMap, collapsedMap) {
  let need = entryIndent(files[index], levelMap);
  if (need <= 0) return false;
  for (let i = index - 1; i >= 0; i -= 1) {
    const level = entryIndent(files[i], levelMap);
    if (level >= need) continue;
    if (collapsedMap?.[files[i].relativePath]) return true;
    need = level;
    if (need <= 0) return false;
  }
  return false;
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {Record<string, number> | null | undefined} levelMap
 * @param {Record<string, boolean> | null | undefined} collapsedMap
 */
export function filterCollapsedEntries(entries, levelMap, collapsedMap) {
  const files = fileEntriesInOrder(entries);
  const hidden = new Set();
  files.forEach((_, index) => {
    if (isFileHiddenByCollapse(files, index, levelMap, collapsedMap)) {
      hidden.add(files[index].relativePath);
    }
  });
  if (hidden.size === 0) return entries;
  return entries.filter((entry) => !hidden.has(entry.relativePath));
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {Record<string, number> | null | undefined} levelMap
 * @param {Record<string, boolean> | null | undefined} collapsedMap
 * @returns {Record<string, { level: number, hasChildren: boolean, collapsed: boolean }>}
 */
/**
 * Files that currently have indented descendants in list order.
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {Record<string, number> | null | undefined} levelMap
 */
export function parentFilesWithChildren(entries, levelMap) {
  const files = fileEntriesInOrder(entries);
  return files.filter((_, index) => descendantFilePaths(files, index, levelMap).length > 0);
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {Record<string, number> | null | undefined} levelMap
 * @param {Record<string, boolean> | null | undefined} collapsedMap
 */
export function areAllParentsCollapsed(entries, levelMap, collapsedMap) {
  const parents = parentFilesWithChildren(entries, levelMap);
  if (parents.length === 0) return false;
  return parents.every((file) => Boolean(collapsedMap?.[file.relativePath]));
}

/**
 * @param {{ relativePath: string, isDirectory?: boolean }[]} entries
 * @param {Record<string, number> | null | undefined} levelMap
 * @param {Record<string, boolean> | null | undefined} collapsedMap
 */
export function buildFileIndentInfo(entries, levelMap, collapsedMap) {
  const files = fileEntriesInOrder(entries);
  /** @type {Record<string, { level: number, hasChildren: boolean, collapsed: boolean }>} */
  const info = {};
  files.forEach((file, index) => {
    info[file.relativePath] = {
      level: entryIndent(file, levelMap),
      hasChildren: descendantFilePaths(files, index, levelMap).length > 0,
      collapsed: Boolean(collapsedMap?.[file.relativePath]),
    };
  });
  return info;
}
