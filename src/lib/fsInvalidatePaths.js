import { getParentPath } from './fsPaths.js';

/**
 * @param {string} changedPath
 */
function pathToAffectedDirs(changedPath) {
  const dirs = new Set();
  if (!changedPath || changedPath === '.') {
    dirs.add('.');
    return dirs;
  }

  dirs.add(changedPath);
  let dir = getParentPath(changedPath);
  while (true) {
    dirs.add(dir);
    if (dir === '.') break;
    dir = getParentPath(dir);
  }
  return dirs;
}

/**
 * @param {string[]} changedPaths
 * @returns {Set<string>}
 */
export function pathsToAffectedDirs(changedPaths) {
  const dirs = new Set(['.']);
  for (const raw of changedPaths) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    for (const dir of pathToAffectedDirs(raw.trim())) {
      dirs.add(dir);
    }
  }
  return dirs;
}

/**
 * @param {string[]} changedPaths
 * @param {string} currentPath
 * @param {Set<string>} [expandedPaths]
 */
export function shouldRefreshListForPaths(changedPaths, currentPath, expandedPaths = new Set(['.'])) {
  if (!changedPaths?.length) return true;

  const dirs = pathsToAffectedDirs(changedPaths);
  if (dirs.has(currentPath)) return true;

  for (const dir of dirs) {
    if (dir !== '.' && (currentPath === dir || currentPath.startsWith(`${dir}/`))) {
      return true;
    }
  }

  for (const expanded of expandedPaths) {
    if (dirs.has(expanded)) return true;
    for (const dir of dirs) {
      if (dir !== '.' && (expanded === dir || expanded.startsWith(`${dir}/`) || dir.startsWith(`${expanded}/`))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * @param {string[]} changedPaths
 * @param {string} currentPath
 * @param {Set<string>} expandedPaths
 * @returns {string[]}
 */
export function resolveTreeReloadPaths(changedPaths, currentPath, expandedPaths) {
  const visible = new Set(['.', currentPath, ...expandedPaths]);

  if (!changedPaths?.length) {
    return [...visible];
  }

  const reload = new Set();
  const dirs = pathsToAffectedDirs(changedPaths);

  for (const dir of dirs) {
    for (const path of visible) {
      if (
        path === dir
        || (dir !== '.' && path.startsWith(`${dir}/`))
        || (path !== '.' && dir.startsWith(`${path}/`))
      ) {
        reload.add(path);
        reload.add(dir);
      }
    }
  }

  if (reload.size === 0) {
    reload.add('.');
  }

  return [...reload];
}
