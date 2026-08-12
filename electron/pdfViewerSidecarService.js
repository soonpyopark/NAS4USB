import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePortablePath } from './appContext.js';
import * as fsService from './fsService.js';
import {
  getPdfPathForViewerSidecar,
  getPdfViewerSidecarPath,
  isPdfDocumentRelativePath,
  isPdfViewerSidecarRelativePath,
  normalizeRelativePath,
} from '../shared/pdfViewerSidecar.js';

/**
 * @param {string} fromPdfPath
 * @param {string} toPdfPath
 */
async function moveSidecarIfExists(fromPdfPath, toPdfPath) {
  const fromSidecar = getPdfViewerSidecarPath(fromPdfPath);
  const toSidecar = getPdfViewerSidecarPath(toPdfPath);
  if (fromSidecar === toSidecar) return;
  if (!(await fsService.pathExists(fromSidecar))) return;

  await fs.mkdir(path.dirname(resolvePortablePath(toSidecar)), { recursive: true }).catch(() => {});
  try {
    await fsService.renamePath(fromSidecar, toSidecar);
  } catch {
    await fsService.copyPath(fromSidecar, toSidecar);
    await fsService.deletePath(fromSidecar);
  }
}

/**
 * @param {string} fromPdfPath
 * @param {string} toPdfPath
 */
async function copySidecarIfExists(fromPdfPath, toPdfPath) {
  const fromSidecar = getPdfViewerSidecarPath(fromPdfPath);
  const toSidecar = getPdfViewerSidecarPath(toPdfPath);
  if (fromSidecar === toSidecar) return;
  if (!(await fsService.pathExists(fromSidecar))) return;

  await fs.mkdir(path.dirname(resolvePortablePath(toSidecar)), { recursive: true }).catch(() => {});
  await fsService.copyPath(fromSidecar, toSidecar);
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncPdfViewerSidecarRename(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);

  if (isPdfDocumentRelativePath(fromPath)) {
    await moveSidecarIfExists(fromPath, toPath);
    return;
  }

  if (isPdfViewerSidecarRelativePath(fromPath)) {
    const pdfFrom = getPdfPathForViewerSidecar(fromPath);
    const pdfTo = isPdfDocumentRelativePath(toPath) ? toPath : getPdfPathForViewerSidecar(toPath);
    if (pdfFrom && pdfTo) {
      await moveSidecarIfExists(pdfFrom, pdfTo);
    }
  }
}

/**
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncPdfViewerSidecarCopy(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);
  if (!isPdfDocumentRelativePath(fromPath)) return;
  await copySidecarIfExists(fromPath, toPath);
}

/**
 * Relocate sidecars when a PDF or folder tree moves (e.g. trash/restore).
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncPdfViewerSidecarMoveTree(fromRelative, toRelative) {
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

      if (!isPdfViewerSidecarRelativePath(rel)) continue;
      const pdfPath = getPdfPathForViewerSidecar(rel);
      if (!pdfPath) continue;

      if (pdfPath === fromPath || pdfPath.startsWith(`${fromPath}/`)) {
        const suffix = pdfPath.slice(fromPath.length);
        const nextPdf = `${toPath}${suffix}`;
        await moveSidecarIfExists(pdfPath, nextPdf);
      }
    }
  }

  if (isPdfDocumentRelativePath(fromPath)) {
    await moveSidecarIfExists(fromPath, toPath);
    return;
  }

  await walk(path.join(root, fromPath === '.' ? '' : fromPath), fromPath);
}

/**
 * @param {string} relativePath
 */
export async function syncPdfViewerSidecarDelete(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (isPdfDocumentRelativePath(normalizedPath)) {
    await fsService.deletePath(getPdfViewerSidecarPath(normalizedPath)).catch(() => {});
    return;
  }
  if (isPdfViewerSidecarRelativePath(normalizedPath)) {
    await fsService.deletePath(normalizedPath).catch(() => {});
  }
}

export { isPdfViewerSidecarRelativePath };
