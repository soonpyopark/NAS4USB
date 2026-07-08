import { joinRelativePath, readFileAsBase64, resolveUniqueName } from '../fsPaths.js';
import { buildMediaStreamUrl } from '../media/streamUrl.js';
import {
  assetFileNameFromAnyUrl,
  getBlockAssetsDir,
  toPackageAssetUrl,
} from './assetUrls.js';
import {
  blockUploadNotAllowedMessage,
  isBlockUploadAllowed,
  resolveBlockUploadFileName,
} from './uploadTypes.js';

export { getBlockAssetsDir } from './assetUrls.js';

/**
 * BlockNote `uploadFile` — saves to edit-time sidecar and returns package-relative URL.
 * Supports image, video, audio, and general file attachments.
 * @param {string} blockRelativePath
 */
export function createBlocknoteUploadFile(blockRelativePath) {
  return async function uploadFile(file) {
    if (!isBlockUploadAllowed(file)) {
      throw new Error(blockUploadNotAllowedMessage(file));
    }

    const assetsDir = getBlockAssetsDir(blockRelativePath);
    await window.nas4usb.fs.mkdir(assetsDir);

    let existingNames = [];
    try {
      const entries = await window.nas4usb.fs.readDir(assetsDir);
      existingNames = entries.map((entry) => entry.name);
    } catch {
      // new assets folder
    }

    const fileName = resolveUniqueName(existingNames, resolveBlockUploadFileName(file));
    const assetPath = joinRelativePath(assetsDir, fileName);
    const base64 = await readFileAsBase64(file);
    await window.nas4usb.fs.writeFile(assetPath, base64);

    return toPackageAssetUrl(fileName);
  };
}

/**
 * BlockNote `resolveFileUrl` — maps package URLs to stream URLs for display/playback.
 * @param {string} blockRelativePath
 */
export function createBlocknoteResolveFileUrl(blockRelativePath) {
  return async function resolveFileUrl(url) {
    if (!url) return url;

    const fileName = assetFileNameFromAnyUrl(url, blockRelativePath);
    if (fileName) {
      return buildMediaStreamUrl(joinRelativePath(getBlockAssetsDir(blockRelativePath), fileName));
    }

    if (url.startsWith('/api/fs/stream') || /^https?:\/\//i.test(url)) {
      return url;
    }

    return buildMediaStreamUrl(url);
  };
}
