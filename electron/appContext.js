import path from 'node:path';
import fs from 'node:fs/promises';
import {
  DEFAULT_DATA_DIR,
  FAVORITES_FOLDER,
  SHARED_FOLDER,
  TRASH_FOLDER,
} from '../shared/constants.js';
import {
  HOMES_DISK_DIR,
  HOMES_FOLDER,
  normalizeRelativePath,
} from '../shared/memberHomes.js';
import { splitWorkspacePath } from '../shared/workspacePaths.js';

/**
 * @typedef {{
 *   portableRoot: string,
 *   exeRoot?: string,
 *   installRoot?: string,
 *   workspaceRoot: string,
 *   dataRoot: string,
 *   tempPath: string,
 *   isDev: boolean,
 *   getServerInfo: () => { port: number, addresses: string[] },
 * }} AppContext
 */

/** @type {AppContext | null} */
let appContext = null;

/**
 * @param {AppContext} context
 */
export function initAppContext(context) {
  appContext = context;
  return appContext;
}

export function getAppContext() {
  if (!appContext) {
    throw new Error('App context is not initialized.');
  }
  return appContext;
}

/** Mutable state root (settings, members, …). */
export function getPortableRoot() {
  return getAppContext().portableRoot;
}

/** Folder that contains NAS4USB.exe (or project root in dev). */
export function getExeRoot() {
  const ctx = getAppContext();
  return ctx.exeRoot ?? ctx.portableRoot;
}

/** Project/asar root that contains node_modules (may differ from USB portable root). */
export function getInstallRoot() {
  const ctx = getAppContext();
  return ctx.installRoot ?? ctx.exeRoot ?? ctx.portableRoot;
}

/**
 * Configured storage root. Contains `share/` and `private/`.
 * Falls back to dirname(dataRoot) when older contexts omit workspaceRoot.
 */
export function getWorkspaceRoot() {
  const ctx = getAppContext();
  if (ctx.workspaceRoot) return ctx.workspaceRoot;
  return path.dirname(path.resolve(ctx.dataRoot));
}

/** Absolute path of the shared documents folder (`{workspaceRoot}/share`). */
export function getDataRoot() {
  return getAppContext().dataRoot;
}

/** Absolute path of the personal-folders container (`{workspaceRoot}/private`). */
export function getHomesRoot() {
  return path.join(path.resolve(getWorkspaceRoot()), HOMES_DISK_DIR);
}

export function getTempPath() {
  return getAppContext().tempPath;
}

/**
 * @param {string} root
 * @param {string} rest
 */
function safeJoinRoot(root, rest) {
  const absolute = rest ? path.resolve(root, rest) : path.resolve(root);
  const relative = path.relative(path.resolve(root), absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal is not allowed.');
  }
  return absolute;
}

/**
 * Resolve a workspace-relative path to an absolute filesystem path.
 * - `공유폴더/...` → `{workspaceRoot}/share`
 * - `개인폴더/...` → `{workspaceRoot}/private`
 * - `__trash/...` → under share
 */
export function resolvePortablePath(relativePath = '') {
  const dataRoot = path.resolve(getDataRoot());
  const homesRoot = path.resolve(getHomesRoot());
  const normalized = normalizeRelativePath(relativePath);

  if (!normalized || normalized === '.') {
    throw new Error('워크스페이스 루트는 가상 경로입니다.');
  }

  if (
    normalized === FAVORITES_FOLDER ||
    normalized.startsWith(`${FAVORITES_FOLDER}/`)
  ) {
    throw new Error('즐겨찾기는 가상 폴더입니다.');
  }

  const { kind, rest } = splitWorkspacePath(normalized);

  if (kind === 'homes') {
    return safeJoinRoot(homesRoot, rest);
  }
  if (kind === 'trash' || kind === 'shared' || kind === 'legacy-shared') {
    const underShared =
      kind === 'trash' ? (rest ? `${TRASH_FOLDER}/${rest}` : TRASH_FOLDER) : rest;
    return safeJoinRoot(dataRoot, underShared);
  }

  throw new Error('Path traversal is not allowed.');
}

export async function ensureDataRoot() {
  const workspaceRoot = getWorkspaceRoot();
  const dataRoot = getDataRoot();
  const homesRoot = getHomesRoot();
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(homesRoot, { recursive: true });
  await fs.mkdir(path.join(dataRoot, TRASH_FOLDER), { recursive: true });
}

export function getAppPaths() {
  const ctx = getAppContext();
  const stateRoot = ctx.portableRoot;
  const exeRoot = ctx.exeRoot ?? stateRoot;
  const workspaceRoot = ctx.workspaceRoot ?? path.dirname(path.resolve(ctx.dataRoot));
  return {
    appPath: stateRoot,
    exeRoot,
    installRoot: ctx.installRoot ?? exeRoot,
    workspaceRoot,
    dataRoot: ctx.dataRoot,
    homesRoot: path.join(path.resolve(workspaceRoot), HOMES_DISK_DIR),
    /** Default workspace root (program folder). */
    defaultDataRoot: stateRoot,
    defaultWorkspaceRoot: stateRoot,
    defaultSharedRoot: path.join(stateRoot, DEFAULT_DATA_DIR),
    sharedFolder: SHARED_FOLDER,
    homesFolder: HOMES_FOLDER,
    sharedDiskDir: DEFAULT_DATA_DIR,
    homesDiskDir: HOMES_DISK_DIR,
    tempPath: ctx.tempPath,
    isDev: ctx.isDev,
  };
}

export function getSyncInfo() {
  return getAppContext().getServerInfo();
}
