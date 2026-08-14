import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_DATA_DIR,
  LEGACY_DATA_DIR,
  LEGACY_SHARED_DISK_DIR,
} from '../shared/constants.js';
import {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  LEGACY_HOMES_DISK_DIR,
  LEGACY_HOMES_FOLDER,
} from '../shared/memberHomes.js';
import { toCanonicalWorkspacePath } from '../shared/workspacePaths.js';
import {
  getDataRoot,
  getHomesRoot,
  getPortableRoot,
  getWorkspaceRoot,
} from './appContext.js';

/** Basenames that previously meant "this path is the shared folder itself". */
const LEGACY_SHARED_BASENAMES = new Set([
  DEFAULT_DATA_DIR,
  LEGACY_DATA_DIR,
  LEGACY_SHARED_DISK_DIR,
]);

/**
 * @param {string} target
 */
async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} target
 */
async function isDirectory(target) {
  try {
    const st = await fs.stat(target);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Move directory entries from `from` into `to` (skip conflicts), then remove `from` if empty.
 * @param {string} from
 * @param {string} to
 */
async function mergeDirectoryInto(from, to) {
  if (!(await pathExists(from))) return false;
  if (path.resolve(from) === path.resolve(to)) return false;

  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (await pathExists(dest)) {
      console.warn(`[data] skip move, exists: ${entry.name}`);
      continue;
    }
    await fs.rename(src, dest);
  }
  try {
    await fs.rmdir(from);
  } catch {
    // leave non-empty leftovers
  }
  return true;
}

/**
 * Rename default shared dir under portable root:
 * `data` / `공유폴더` → `share` when the target does not already exist.
 *
 * @param {string} portableRoot
 * @param {{ dataRoot?: string | null }} settings
 */
export async function migrateDefaultDataDirName(portableRoot, settings) {
  const nextPath = path.join(portableRoot, DEFAULT_DATA_DIR);
  const legacyCandidates = [
    path.join(portableRoot, LEGACY_DATA_DIR),
    path.join(portableRoot, LEGACY_SHARED_DISK_DIR),
  ];

  let nextSettings = settings;
  let renamedFrom = null;

  for (const legacyPath of legacyCandidates) {
    if (!(await pathExists(legacyPath))) continue;
    if (path.resolve(legacyPath) === path.resolve(nextPath)) continue;

    if (!(await pathExists(nextPath))) {
      await fs.rename(legacyPath, nextPath);
      renamedFrom = path.basename(legacyPath);
      console.log(`[data] renamed ${renamedFrom}/ → ${DEFAULT_DATA_DIR}/`);
      break;
    }

    const merged = await mergeDirectoryInto(legacyPath, nextPath);
    if (merged) {
      renamedFrom = path.basename(legacyPath);
      console.log(`[data] merged ${renamedFrom}/ → ${DEFAULT_DATA_DIR}/`);
      break;
    }
  }

  return { settings: nextSettings, renamed: Boolean(renamedFrom) };
}

/**
 * Settings previously stored the shared folder path. Now they store the parent
 * workspace root (`…/share` → `…`, `portableRoot/share` → null).
 *
 * @param {string} portableRoot
 * @param {{ dataRoot?: string | null }} settings
 */
export async function migrateConfiguredWorkspaceRoot(portableRoot, settings) {
  const configured =
    settings?.dataRoot != null ? String(settings.dataRoot).trim() : '';
  if (!configured) return { settings, changed: false };

  const resolved = path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(portableRoot, configured);
  const base = path.basename(resolved).toLowerCase();
  const legacyBases = new Set(
    [...LEGACY_SHARED_BASENAMES].map((name) => name.toLowerCase()),
  );

  if (!legacyBases.has(base)) {
    return { settings, changed: false };
  }

  const parent = path.dirname(resolved);
  const nextConfigured =
    path.resolve(parent) === path.resolve(portableRoot) ? null : parent;

  console.log(
    `[data] settings.dataRoot ${resolved} → workspace root ${nextConfigured ?? '(default program folder)'}`,
  );
  return {
    settings: { ...settings, dataRoot: nextConfigured },
    changed: true,
  };
}

/**
 * Ensure `{workspaceRoot}/share` and `{workspaceRoot}/private`.
 * If this root used to *be* the shared folder (files at top level, no share/),
 * move those entries into share/. Pull old sibling `private` when present.
 */
export async function ensureSharePrivateUnderWorkspaceRoot() {
  const workspaceRoot = path.resolve(getWorkspaceRoot());
  const sharePath = path.resolve(getDataRoot());
  const privatePath = path.resolve(getHomesRoot());

  await fs.mkdir(workspaceRoot, { recursive: true });

  const portableRoot = path.resolve(getPortableRoot());
  const isAppInstallRoot = path.resolve(workspaceRoot) === portableRoot;
  const shareExistedBefore = await isDirectory(sharePath);

  /** Names that do not count as user content inside share/. */
  const shareSystemNames = new Set(['__trash', '.tmp', '.nas4usb', 'Thumbs.db', 'desktop.ini']);

  /** @type {string[]} */
  let shareUserEntriesBefore = [];
  if (shareExistedBefore) {
    const names = await fs.readdir(sharePath).catch(() => []);
    shareUserEntriesBefore = names.filter((name) => !shareSystemNames.has(name));
  }
  const shareWasEmpty = shareUserEntriesBefore.length === 0;

  await fs.mkdir(sharePath, { recursive: true });
  await fs.mkdir(privatePath, { recursive: true });

  // Never scoop the program folder into share/. Only wrap dedicated data roots
  // that previously *were* the shared folder (files at top level).
  if (shareWasEmpty && !isAppInstallRoot) {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    const skip = new Set([
      DEFAULT_DATA_DIR,
      HOMES_DISK_DIR,
      LEGACY_HOMES_DISK_DIR,
      HOMES_FOLDER,
      LEGACY_HOMES_FOLDER,
      '.nas4usb',
    ]);
    let moved = 0;
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const src = path.join(workspaceRoot, entry.name);
      const dest = path.join(sharePath, entry.name);
      if (entry.isDirectory() && (await pathExists(dest))) {
        const merged = await mergeDirectoryInto(src, dest);
        if (merged) moved += 1;
        continue;
      }
      if (await pathExists(dest)) {
        console.warn(`[data] skip wrap into share/, exists: ${entry.name}`);
        continue;
      }
      await fs.rename(src, dest);
      moved += 1;
    }
    if (moved > 0) {
      console.log(
        `[data] wrapped ${moved} item(s) into ${DEFAULT_DATA_DIR}/ under workspace root`,
      );
    }

    // Old model: private was sibling of the shared folder (= sibling of workspaceRoot).
    const legacySiblingPrivate = path.join(
      path.dirname(workspaceRoot),
      HOMES_DISK_DIR,
    );
    if (
      path.resolve(legacySiblingPrivate) !== path.resolve(privatePath) &&
      (await pathExists(legacySiblingPrivate))
    ) {
      const merged = await mergeDirectoryInto(legacySiblingPrivate, privatePath);
      if (merged) {
        console.log(
          `[data] merged legacy sibling ${HOMES_DISK_DIR}/ → workspace ${HOMES_DISK_DIR}/`,
        );
      }
    }
  } else if (!isAppInstallRoot) {
    // share already has content — still pull a stray root __trash into share/__trash
    const strayTrash = path.join(workspaceRoot, '__trash');
    if (await pathExists(strayTrash)) {
      const destTrash = path.join(sharePath, '__trash');
      const merged = await mergeDirectoryInto(strayTrash, destTrash);
      if (merged) {
        console.log('[data] merged stray __trash/ into share/__trash/');
      }
    }
  }

  // Nested homes left under share/ (or Korean names).
  const nestedCandidates = [
    path.join(sharePath, LEGACY_HOMES_FOLDER),
    path.join(sharePath, LEGACY_HOMES_DISK_DIR),
    path.join(sharePath, HOMES_FOLDER),
    path.join(sharePath, HOMES_DISK_DIR),
    path.join(workspaceRoot, LEGACY_HOMES_DISK_DIR),
    path.join(workspaceRoot, HOMES_FOLDER),
    path.join(workspaceRoot, LEGACY_HOMES_FOLDER),
  ];

  for (const from of nestedCandidates) {
    if (!(await pathExists(from))) continue;
    if (path.resolve(from) === path.resolve(privatePath)) continue;
    const moved = await mergeDirectoryInto(from, privatePath);
    if (moved) {
      console.log(
        `[data] moved homes from ${path.basename(path.dirname(from))}/${path.basename(from)}/ → ${HOMES_DISK_DIR}/`,
      );
    }
  }
}

/**
 * @deprecated use ensureSharePrivateUnderWorkspaceRoot
 */
export async function migrateHomesToSiblingOfShared() {
  await ensureSharePrivateUnderWorkspaceRoot();
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function rewritePathValue(value) {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')) return value;
  return toCanonicalWorkspacePath(value.replace(/\\/g, '/'));
}

/**
 * @param {Record<string, unknown>} map
 */
function rewritePathKeyedMap(map) {
  /** @type {Record<string, unknown>} */
  const next = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const nextKey = typeof key === 'string' ? String(rewritePathValue(key)) : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      /** @type {Record<string, unknown>} */
      const obj = { ...value };
      if ('originalPath' in obj) obj.originalPath = rewritePathValue(obj.originalPath);
      if ('relativePath' in obj) obj.relativePath = rewritePathValue(obj.relativePath);
      if ('path' in obj) obj.path = rewritePathValue(obj.path);
      next[nextKey] = obj;
    } else {
      next[nextKey] = value;
    }
  }
  return next;
}

/**
 * Rewrite stored relative paths in state JSON files beside the exe.
 * @param {string} [portableRoot]
 */
export async function migrateStoredWorkspacePaths(portableRoot = getPortableRoot()) {
  const files = [
    '.nas4usb-favorites.json',
    '.nas4usb-file-access.json',
    '.nas4usb-shares.json',
    '.nas4usb-trash.json',
  ];

  for (const fileName of files) {
    const filePath = path.join(portableRoot, fileName);
    if (!(await pathExists(filePath))) continue;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      let changed = false;
      let next = parsed;

      if (parsed && typeof parsed === 'object') {
        if (parsed.items && typeof parsed.items === 'object') {
          const items = rewritePathKeyedMap(parsed.items);
          if (JSON.stringify(items) !== JSON.stringify(parsed.items)) {
            next = { ...parsed, items };
            changed = true;
          }
        } else if (parsed.links && typeof parsed.links === 'object') {
          const links = rewritePathKeyedMap(parsed.links);
          if (JSON.stringify(links) !== JSON.stringify(parsed.links)) {
            next = { ...parsed, links };
            changed = true;
          }
        } else if (parsed.favorites && typeof parsed.favorites === 'object') {
          const favorites = rewritePathKeyedMap(parsed.favorites);
          if (JSON.stringify(favorites) !== JSON.stringify(parsed.favorites)) {
            next = { ...parsed, favorites };
            changed = true;
          }
        } else if (parsed.files && typeof parsed.files === 'object') {
          const filesMap = rewritePathKeyedMap(parsed.files);
          if (JSON.stringify(filesMap) !== JSON.stringify(parsed.files)) {
            next = { ...parsed, files: filesMap };
            changed = true;
          }
        } else {
          const rewritten = rewritePathKeyedMap(parsed);
          if (JSON.stringify(rewritten) !== JSON.stringify(parsed)) {
            next = rewritten;
            changed = true;
          }
        }
      }

      if (changed) {
        await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        console.log(`[data] migrated paths in ${fileName}`);
      }
    } catch (err) {
      console.warn(`[data] path migrate skipped for ${fileName}:`, err);
    }
  }
}

/**
 * @param {string} portableRoot
 * @param {{ dataRoot?: string | null }} settings
 */
export async function prepareWorkspaceLayout(portableRoot, settings) {
  let next = settings;
  ({ settings: next } = await migrateDefaultDataDirName(portableRoot, next));
  ({ settings: next } = await migrateConfiguredWorkspaceRoot(portableRoot, next));
  return next;
}

export async function finalizeWorkspaceLayout() {
  await ensureSharePrivateUnderWorkspaceRoot();
  await migrateStoredWorkspacePaths();
}
