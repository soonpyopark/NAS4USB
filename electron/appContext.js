import path from 'node:path';
import fs from 'node:fs/promises';
import { DEFAULT_DEPARTMENT_CODE } from '../shared/constants.js';

/** @type {{ portableRoot: string, dataRoot: string, tempPath: string, isDev: boolean, getServerInfo: () => { port: number, addresses: string[] } } | null} */
let appContext = null;

/**
 * @param {{ portableRoot: string, dataRoot: string, tempPath: string, isDev: boolean, getServerInfo: () => { port: number, addresses: string[] } }} context
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

export function getDataRoot() {
  return getAppContext().dataRoot;
}

export function getTempPath() {
  return getAppContext().tempPath;
}

export function resolvePortablePath(relativePath = '') {
  const dataRoot = getDataRoot();
  const normalized = path.normalize(relativePath || '.');
  const absolute = path.resolve(dataRoot, normalized);
  if (!absolute.startsWith(dataRoot)) {
    throw new Error('Path traversal is not allowed.');
  }
  return absolute;
}

export async function ensureDataRoot() {
  const dataRoot = getDataRoot();
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(path.join(dataRoot, DEFAULT_DEPARTMENT_CODE), { recursive: true });
}

export function getAppPaths() {
  const ctx = getAppContext();
  return {
    appPath: ctx.portableRoot,
    dataRoot: ctx.dataRoot,
    tempPath: ctx.tempPath,
    isDev: ctx.isDev,
  };
}

export function getSyncInfo() {
  return getAppContext().getServerInfo();
}
