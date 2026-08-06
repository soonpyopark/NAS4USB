import { joinRelativePath, readFileAsBase64, resolveUniqueName } from '../fsPaths.js';
import { buildMediaStreamUrl } from '../media/streamUrl.js';
import {
  assetFileNameFromAnyUrl,
  getTiptapAssetsDir,
  toPackageAssetUrl,
} from './assetUrls.js';
import {
  isTiptapUploadAllowed,
  resolveTiptapUploadFileName,
  tiptapUploadNotAllowedMessage,
} from './uploadTypes.js';

/**
 * @param {string} tiptapRelativePath
 */
export function createTiptapUploadFile(tiptapRelativePath) {
  return async function uploadFile(file) {
    if (!isTiptapUploadAllowed(file)) {
      throw new Error(tiptapUploadNotAllowedMessage(file));
    }

    const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
    await window.nas4usb.fs.mkdir(assetsDir);

    let existingNames = [];
    try {
      const entries = await window.nas4usb.fs.readDir(assetsDir);
      existingNames = entries.map((entry) => entry.name);
    } catch {
      // new assets folder
    }

    const fileName = resolveUniqueName(existingNames, resolveTiptapUploadFileName(file));
    const assetPath = joinRelativePath(assetsDir, fileName);
    const base64 = await readFileAsBase64(file);
    await window.nas4usb.fs.writeFile(assetPath, base64);

    return toPackageAssetUrl(fileName);
  };
}

/**
 * @param {string} tiptapRelativePath
 */
export function createTiptapResolveFileUrl(tiptapRelativePath) {
  return async function resolveFileUrl(url) {
    if (!url) return url;

    const fileName = assetFileNameFromAnyUrl(url, tiptapRelativePath);
    if (fileName) {
      return buildMediaStreamUrl(joinRelativePath(getTiptapAssetsDir(tiptapRelativePath), fileName));
    }

    if (url.startsWith('/api/fs/stream') || /^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }

    return buildMediaStreamUrl(url);
  };
}
