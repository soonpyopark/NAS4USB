import { joinRelativePath } from '../fsPaths.js';
import { getBlockAssetSidecarPath } from '../../../shared/blockAssetPaths.js';

export const BLOCK_ASSET_URL_PREFIX = 'assets/';

/** @param {string} blockRelativePath e.g. "folder/NoName.block" */
export function getBlockAssetsDir(blockRelativePath) {
  return getBlockAssetSidecarPath(blockRelativePath);
}

/** @param {string} path */
export function normalizeAssetPath(path) {
  return path.replace(/\\/g, '/');
}

/** @param {string} fileName */
export function toPackageAssetUrl(fileName) {
  return `${BLOCK_ASSET_URL_PREFIX}${fileName}`;
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function packageAssetUrlToFileName(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith(BLOCK_ASSET_URL_PREFIX)) return null;

  const fileName = url.slice(BLOCK_ASSET_URL_PREFIX.length);
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return null;
  }
  return fileName;
}

/**
 * @param {string} url
 * @param {string} blockRelativePath
 * @returns {string | null} file name inside assets/
 */
export function assetFileNameFromAnyUrl(url, blockRelativePath) {
  const packageName = packageAssetUrlToFileName(url);
  if (packageName) return packageName;

  const assetsDir = normalizeAssetPath(getBlockAssetsDir(blockRelativePath));

  if (url.startsWith('/api/fs/stream')) {
    try {
      const pathParam = new URL(url, 'http://localhost').searchParams.get('path');
      if (!pathParam) return null;
      return assetFileNameFromSidecarPath(normalizeAssetPath(pathParam), assetsDir);
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname !== '/api/fs/stream') return null;
      const pathParam = parsed.searchParams.get('path');
      if (!pathParam) return null;
      return assetFileNameFromSidecarPath(normalizeAssetPath(pathParam), assetsDir);
    } catch {
      return null;
    }
  }

  return assetFileNameFromSidecarPath(normalizeAssetPath(url), assetsDir);
}

/**
 * @param {string} sidecarPath
 * @param {string} assetsDir
 * @returns {string | null}
 */
function assetFileNameFromSidecarPath(sidecarPath, assetsDir) {
  if (sidecarPath === assetsDir) return null;
  const prefix = `${assetsDir}/`;
  if (!sidecarPath.startsWith(prefix)) return null;
  const fileName = sidecarPath.slice(prefix.length);
  if (!fileName || fileName.includes('/')) return null;
  return fileName;
}

/**
 * @param {string} url
 * @param {string} blockRelativePath
 * @returns {string | null} sidecar relative path
 */
export function sidecarPathFromBlockUrl(url, blockRelativePath) {
  const assetsDir = normalizeAssetPath(getBlockAssetsDir(blockRelativePath));
  const fileName = assetFileNameFromAnyUrl(url, blockRelativePath);
  if (!fileName) return null;
  return joinRelativePath(assetsDir, fileName);
}

/**
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 * @param {string} blockRelativePath
 * @returns {import('@blocknote/core').PartialBlock[]}
 */
export function normalizeBlockAssetUrls(blocks, blockRelativePath) {
  return rewriteBlockAssetUrls(structuredClone(blocks), blockRelativePath);
}

/**
 * @param {import('@blocknote/core').PartialBlock[]} blocks
 * @param {string} blockRelativePath
 */
function rewriteBlockAssetUrls(blocks, blockRelativePath) {
  for (const block of blocks) {
    const url = block.props?.url;
    if (typeof url === 'string') {
      const fileName = assetFileNameFromAnyUrl(url, blockRelativePath);
      if (fileName) {
        block.props = { ...block.props, url: toPackageAssetUrl(fileName) };
      }
    }
    if (Array.isArray(block.children) && block.children.length) {
      rewriteBlockAssetUrls(block.children, blockRelativePath);
    }
  }
  return blocks;
}
