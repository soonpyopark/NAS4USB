import { joinRelativePath } from '../fsPaths.js';
import {
  getLegacySecTiptapAssetSidecarPath,
  getTiptapAssetSidecarPath,
} from '../../../shared/tiptapAssetPaths.js';

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
  const normalized = normalizeAssetPath(url);
  const lower = normalized.toLowerCase();
  const prefix = lower.startsWith(TIPTAP_ASSET_URL_PREFIX)
    ? TIPTAP_ASSET_URL_PREFIX
    : lower.startsWith('asset/')
      ? 'asset/'
      : '';
  if (!prefix) return null;
  const fileName = normalized.slice(prefix.length);
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return null;
  }
  return fileName;
}

/**
 * Link hrefs may use `assets/…` or the shorter `asset/…`.
 * @param {string} href
 * @param {string} [tiptapRelativePath]
 * @returns {string | null}
 */
export function linkHrefToAssetFileName(href, tiptapRelativePath = '') {
  if (!href || typeof href !== 'string') return null;
  let raw = href.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  const normalized = normalizeAssetPath(raw).replace(/^\.\//, '');

  if (tiptapRelativePath) {
    const fromKnown = assetFileNameFromAnyUrl(normalized, tiptapRelativePath);
    if (fromKnown) return fromKnown;
  }

  const lower = normalized.toLowerCase();
  const prefix = lower.startsWith(TIPTAP_ASSET_URL_PREFIX)
    ? TIPTAP_ASSET_URL_PREFIX
    : lower.startsWith('asset/')
      ? 'asset/'
      : '';
  if (!prefix) return null;
  const fileName = normalized.slice(prefix.length);
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
/**
 * @param {string} tiptapRelativePath
 */
function assetDirPrefixes(tiptapRelativePath) {
  const dirs = [normalizeAssetPath(getTiptapAssetsDir(tiptapRelativePath))];
  const legacy = getLegacySecTiptapAssetSidecarPath(tiptapRelativePath);
  if (legacy) dirs.push(normalizeAssetPath(legacy));
  return dirs;
}

/**
 * @param {string} candidate
 * @param {string[]} dirs
 */
function fileNameUnderAssetDirs(candidate, dirs) {
  const normalized = normalizeAssetPath(candidate);
  for (const assetsDir of dirs) {
    if (normalized.startsWith(`${assetsDir}/`)) {
      return normalized.slice(assetsDir.length + 1).split('/').pop() ?? null;
    }
  }
  return null;
}

export function assetFileNameFromAnyUrl(url, tiptapRelativePath) {
  const packageName = packageAssetUrlToFileName(url);
  if (packageName) return packageName;

  const dirs = assetDirPrefixes(tiptapRelativePath);
  const fromPath = fileNameUnderAssetDirs(url, dirs);
  if (fromPath) return fromPath;

  try {
    const parsed = new URL(url, 'http://local.invalid');
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) {
      return fileNameUnderAssetDirs(decodeURIComponent(pathParam), dirs);
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Walk TipTap JSON and rewrite media `src` / link `href` to package-relative `assets/<file>`.
 * Covers image, video, audio, fileAttachment, and attachment links.
 * @param {import('@tiptap/core').JSONContent} doc
 * @param {string} tiptapRelativePath
 */
export function normalizeTiptapAssetUrls(doc, tiptapRelativePath) {
  const cloned = structuredClone(doc ?? { type: 'doc', content: [] });
  rewriteNodeAssetUrls(cloned, tiptapRelativePath);
  return cloned;
}

/**
 * @param {Record<string, unknown> | undefined} attrs
 * @param {string} key
 * @param {string} tiptapRelativePath
 */
function rewriteUrlAttr(attrs, key, tiptapRelativePath) {
  const value = attrs?.[key];
  if (typeof value !== 'string') return attrs;
  const fileName =
    assetFileNameFromAnyUrl(value, tiptapRelativePath) ||
    (key === 'href' ? linkHrefToAssetFileName(value, tiptapRelativePath) : null);
  if (!fileName) return attrs;
  return { ...attrs, [key]: toPackageAssetUrl(fileName) };
}

/**
 * @param {import('@tiptap/core').JSONContent} node
 * @param {string} tiptapRelativePath
 */
function rewriteNodeAssetUrls(node, tiptapRelativePath) {
  if (!node || typeof node !== 'object') return;

  if (node.attrs) {
    node.attrs = rewriteUrlAttr(node.attrs, 'src', tiptapRelativePath);
    node.attrs = rewriteUrlAttr(node.attrs, 'href', tiptapRelativePath);
  }

  if (Array.isArray(node.marks)) {
    node.marks = node.marks.map((mark) => {
      if (!mark?.attrs) return mark;
      return { ...mark, attrs: rewriteUrlAttr(mark.attrs, 'href', tiptapRelativePath) };
    });
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
