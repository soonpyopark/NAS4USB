import path from 'node:path';
import fs from 'node:fs/promises';
import { DEFAULT_DATA_DIR, TRASH_FOLDER } from '../shared/constants.js';

/** @type {{ portableRoot: string, installRoot?: string, dataRoot: string, tempPath: string, isDev: boolean, getServerInfo: () => { port: number, addresses: string[] } } | null} */
let appContext = null;

/**
 * @param {{ portableRoot: string, installRoot?: string, dataRoot: string, tempPath: string, isDev: boolean, getServerInfo: () => { port: number, addresses: string[] } }} context
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

export function getPortableRoot() {
  return getAppContext().portableRoot;
}

/** Project/asar root that contains node_modules (may differ from USB portable root). */
export function getInstallRoot() {
  const ctx = getAppContext();
  return ctx.installRoot ?? ctx.portableRoot;
}

export function getDataRoot() {
  return getAppContext().dataRoot;
}

export function getTempPath() {
  return getAppContext().tempPath;
}

export function resolvePortablePath(relativePath = '') {
  const dataRoot = path.resolve(getDataRoot());
  const normalized = path.normalize(relativePath || '.');
  const absolute = path.resolve(dataRoot, normalized);
  const relative = path.relative(dataRoot, absolute);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal is not allowed.');
  }

  return absolute;
}

export async function ensureDataRoot() {
  const dataRoot = getDataRoot();
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(path.join(dataRoot, TRASH_FOLDER), { recursive: true });
}

export function getAppPaths() {
  const ctx = getAppContext();
  const portableRoot = ctx.portableRoot;
  return {
    appPath: portableRoot,
    installRoot: ctx.installRoot ?? portableRoot,
    dataRoot: ctx.dataRoot,
    defaultDataRoot: path.join(portableRoot, DEFAULT_DATA_DIR),
    tempPath: ctx.tempPath,
    isDev: ctx.isDev,
  };
}

export function getSyncInfo() {
  return getAppContext().getServerInfo();
}
