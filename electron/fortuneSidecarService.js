import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePortablePath } from './appContext.js';
import * as fsService from './fsService.js';
import {
  getFortuneSidecarPath,
  getSpreadsheetPathForFortuneSidecar,
  isFortuneSidecarRelativePath,
  isSpreadsheetDocumentRelativePath,
  normalizeRelativePath,
} from '../shared/fortuneSheetSidecar.js';

/**
 * @param {string} fromSpreadsheetPath
 * @param {string} toSpreadsheetPath
 */
async function moveSidecarIfExists(fromSpreadsheetPath, toSpreadsheetPath) {
  const fromSidecar = getFortuneSidecarPath(fromSpreadsheetPath);
  const toSidecar = getFortuneSidecarPath(toSpreadsheetPath);
  if (fromSidecar === toSidecar) return;
  if (!(await fsService.pathExists(fromSidecar))) return;

  await fsService.ensureParentDir(resolvePortablePath(toSidecar)).catch(() => {});
  try {
    await fsService.renamePath(fromSidecar, toSidecar);
  } catch {
    await fsService.copyPath(fromSidecar, toSidecar);
    await fsService.deletePath(fromSidecar);
  }
}

/**
 * @param {string} fromSpreadsheetPath
 * @param {string} toSpreadsheetPath
 */
async function copySidecarIfExists(fromSpreadsheetPath, toSpreadsheetPath) {
  const fromSidecar = getFortuneSidecarPath(fromSpreadsheetPath);
  const toSidecar = getFortuneSidecarPath(toSpreadsheetPath);
  if (fromSidecar === toSidecar) return;
  if (!(await fsService.pathExists(fromSidecar))) return;

  await fsService.ensureParentDir(resolvePortablePath(toSidecar)).catch(() => {});
  await fsService.copyPath(fromSidecar, toSidecar);
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncFortuneSidecarRename(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);

  if (isSpreadsheetDocumentRelativePath(fromPath)) {
    await moveSidecarIfExists(fromPath, toPath);
    return;
  }

  if (isFortuneSidecarRelativePath(fromPath)) {
    const spreadsheetFrom = getSpreadsheetPathForFortuneSidecar(fromPath);
    const spreadsheetTo = isSpreadsheetDocumentRelativePath(toPath)
      ? toPath
      : getSpreadsheetPathForFortuneSidecar(toPath);
    if (spreadsheetFrom && spreadsheetTo) {
      await moveSidecarIfExists(spreadsheetFrom, spreadsheetTo);
    }
  }
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncFortuneSidecarCopy(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);
  if (!isSpreadsheetDocumentRelativePath(fromPath)) return;
  await copySidecarIfExists(fromPath, toPath);
}

/**
 * Relocate sidecars when a spreadsheet file or folder tree moves (e.g. trash/restore).
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncFortuneSidecarMoveTree(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);
  const root = resolvePortablePath('.');

  /**
   * @param {string} absoluteDir
   * @param {string} relativeDir
   */
  async function walk(absoluteDir, relativeDir) {
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = relativeDir === '.' ? entry.name : `${relativeDir}/${entry.name}`;
      const abs = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        await walk(abs, rel);
        continue;
      }

      if (!isFortuneSidecarRelativePath(rel)) continue;
      const spreadsheetPath = getSpreadsheetPathForFortuneSidecar(rel);
      if (!spreadsheetPath) continue;

      if (spreadsheetPath === fromPath || spreadsheetPath.startsWith(`${fromPath}/`)) {
        const suffix = spreadsheetPath.slice(fromPath.length);
        const nextSpreadsheet = `${toPath}${suffix}`;
        await moveSidecarIfExists(spreadsheetPath, nextSpreadsheet);
      }
    }
  }

  await walk(root, '.');

  if (isSpreadsheetDocumentRelativePath(fromPath)) {
    await moveSidecarIfExists(fromPath, toPath);
  }
}

/**
 * @param {string} relativePath
 */
export async function syncFortuneSidecarDelete(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (isSpreadsheetDocumentRelativePath(normalizedPath)) {
    await fsService.deletePath(getFortuneSidecarPath(normalizedPath)).catch(() => {});
    return;
  }

  if (isFortuneSidecarRelativePath(normalizedPath)) {
    await fsService.deletePath(normalizedPath).catch(() => {});
  }
}

export { isFortuneSidecarRelativePath };
