import { joinRelativePath } from '../fsPaths.js';
import { getTiptapAssetSidecarPath } from '../../../shared/tiptapAssetPaths.js';

export const TIPTAP_ASSET_URL_PREFIX = 'assets/';

/** @param {string} tiptapRelativePath */
export function getTiptapAssetsDir(tiptapRelativePath) {
  return getTiptapAssetSidecarPath(tiptapRelativePath);
}

/** @param {string} path */
export function normalizeAssetPath(path) {
  return path.replace(/\\/g, '/');
}

/** @param {string} fileName */
export function toPackageAssetUrl(fileName) {
  return `${TIPTAP_ASSET_URL_PREFIX}${fileName}`;
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function packageAssetUrlToFileName(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith(TIPTAP_ASSET_URL_PREFIX)) return null;
  const fileName = url.slice(TIPTAP_ASSET_URL_PREFIX.length);
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return null;
  }
  return fileName;
}

/**
 * @param {string} url
 * @param {string} tiptapRelativePath
 * @returns {string | null}
 */
export function assetFileNameFromAnyUrl(url, tiptapRelativePath) {
  const packageName = packageAssetUrlToFileName(url);
  if (packageName) return packageName;

  const assetsDir = normalizeAssetPath(getTiptapAssetsDir(tiptapRelativePath));
  const normalizedUrl = normalizeAssetPath(url);
  if (normalizedUrl.startsWith(`${assetsDir}/`)) {
    return normalizedUrl.slice(assetsDir.length + 1).split('/').pop() ?? null;
  }

  try {
    const parsed = new URL(url, 'http://local.invalid');
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) {
      const normalizedPath = normalizeAssetPath(decodeURIComponent(pathParam));
      if (normalizedPath.startsWith(`${assetsDir}/`)) {
        return normalizedPath.slice(assetsDir.length + 1).split('/').pop() ?? null;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Walk TipTap JSON and rewrite media `src` attrs to package-relative `assets/<file>`.
 * @param {import('@tiptap/core').JSONContent} doc
 * @param {string} tiptapRelativePath
 */
export function normalizeTiptapAssetUrls(doc, tiptapRelativePath) {
  const cloned = structuredClone(doc ?? { type: 'doc', content: [] });
  rewriteNodeAssetUrls(cloned, tiptapRelativePath);
  return cloned;
}

/**
 * @param {import('@tiptap/core').JSONContent} node
 * @param {string} tiptapRelativePath
 */
function rewriteNodeAssetUrls(node, tiptapRelativePath) {
  if (!node || typeof node !== 'object') return;

  const src = node.attrs?.src;
  if (typeof src === 'string') {
    const fileName = assetFileNameFromAnyUrl(src, tiptapRelativePath);
    if (fileName) {
      node.attrs = { ...node.attrs, src: toPackageAssetUrl(fileName) };
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      rewriteNodeAssetUrls(child, tiptapRelativePath);
    }
  }
}

/**
 * @param {string} tiptapRelativePath
 * @param {string} fileName
 */
export function joinTiptapAssetPath(tiptapRelativePath, fileName) {
  return joinRelativePath(getTiptapAssetsDir(tiptapRelativePath), fileName);
}
