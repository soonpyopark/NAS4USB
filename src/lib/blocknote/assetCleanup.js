import { joinRelativePath } from '../fsPaths.js';
import { sidecarPathFromBlockUrl } from './assetUrls.js';
import { getBlockAssetsDir } from './uploadFile.js';

/** @param {string} path */
function normalizeAssetPath(path) {
  return path.replace(/\\/g, '/');
}

/**
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 * @param {import('@blocknote/core').PartialBlock[]} out
 */
function flattenBlocks(blocks, out) {
  for (const block of blocks) {
    out.push(block);
    if (Array.isArray(block.children) && block.children.length) {
      flattenBlocks(block.children, out);
    }
  }
}

/**
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 * @param {string} blockRelativePath
 * @returns {Set<string>}
 */
export function collectReferencedAssetPaths(blocks, blockRelativePath) {
  const referenced = new Set();
  const flat = [];
  flattenBlocks(blocks, flat);

  for (const block of flat) {
    const url = block.props?.url;
    if (typeof url !== 'string') continue;
    const assetPath = sidecarPathFromBlockUrl(url, blockRelativePath);
    if (assetPath) referenced.add(normalizeAssetPath(assetPath));
  }

  return referenced;
}

/**
 * Delete files in `{block}.assets/` that are no longer referenced by the document.
 * @param {string} blockRelativePath
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 */
export async function cleanupUnreferencedBlockAssets(blockRelativePath, blocks) {
  const assetsDir = getBlockAssetsDir(blockRelativePath);
  const referenced = collectReferencedAssetPaths(blocks, blockRelativePath);

  let entries = [];
  try {
    entries = await window.nas4usb.fs.readDir(assetsDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const assetPath = normalizeAssetPath(joinRelativePath(assetsDir, entry.name));
    if (referenced.has(assetPath)) continue;
    await window.nas4usb.fs.delete(assetPath);
  }
}
