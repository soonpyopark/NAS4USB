import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePortablePath } from './appContext.js';
import * as fsService from './fsService.js';
import {
  getTiptapAssetSidecarPath,
  isTiptapDocumentRelativePath,
  normalizeRelativePath,
} from '../shared/tiptapAssetPaths.js';

const SIDECAR_LOCKED_MESSAGE =
  'TipTap 편집 중이거나 미디어 파일이 사용 중입니다. .tiptap 편집 창을 닫은 뒤 다시 시도해 주세요.';

/**
 * Images inserted since the last save live only in `{doc}.tiptap.assets/`, not yet in the
 * `.tiptap` package — so the sidecar has to follow the document rather than be dropped.
 *
 * @param {string} fromDocPath
 * @param {string} toDocPath
 */
async function moveAssetsIfExists(fromDocPath, toDocPath) {
  const fromAssets = getTiptapAssetSidecarPath(fromDocPath);
  const toAssets = getTiptapAssetSidecarPath(toDocPath);
  if (fromAssets === toAssets) return;
  if (!(await fsService.pathExists(fromAssets))) return;

  // A sidecar left at the destination by an earlier document would otherwise merge in.
  if (await fsService.pathExists(toAssets)) {
    await fsService.deletePath(toAssets).catch(() => {});
  }

  await fsService.ensureParentDir(resolvePortablePath(toAssets)).catch(() => {});

  try {
    await fsService.renamePath(fromAssets, toAssets);
  } catch {
    try {
      await fsService.copyPath(fromAssets, toAssets);
      await fsService.deletePath(fromAssets);
    } catch {
      // Roll the half-done copy back so the caller's aborted rename leaves no stray folder.
      await fsService.deletePath(toAssets).catch(() => {});
      throw new Error(SIDECAR_LOCKED_MESSAGE);
    }
  }
}

/**
 * Keep `{doc}.tiptap.assets/` next to its document on rename and move.
 *
 * Folder renames need no work: the sidecar sits beside the document inside the folder
 * and travels with it. A sidecar renamed directly is left alone so the caller's own
 * rename still applies.
 *
 * @param {string} fromRelative
 * @param {string} toRelative
 */
export async function syncTiptapAssetRename(fromRelative, toRelative) {
  const fromPath = normalizeRelativePath(fromRelative);
  const toPath = normalizeRelativePath(toRelative);
  if (!isTiptapDocumentRelativePath(fromPath)) return;
  await moveAssetsIfExists(fromPath, toPath);
}
