import { getImageMimeType, isImageExtension } from '../media/mediaTypes.js';
import {
  naturalCompareNames,
  openServerArchivePages,
  readRelativePathArrayBuffer,
} from './archivePages.js';

const IMAGE_NAME_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|apng)$/i;

/**
 * First image page only — avoids unpacking every frame for the explorer preview.
 *
 * @param {string} relativePath
 * @param {string} extension
 * @returns {Promise<{ url: string, pageCount: number, revoke: () => void | Promise<void> }>}
 */
export async function resolveComicFirstPage(relativePath, extension) {
  const ext = String(extension ?? '').toLowerCase();

  if (ext === 'zip' || ext === 'cbz') {
    try {
      const buffer = await readRelativePathArrayBuffer(relativePath);
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(buffer);
      /** @type {Array<{ name: string, entry: import('jszip').JSZipObject }>} */
      const imageEntries = [];
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        if (path.startsWith('__MACOSX/')) return;
        if (!IMAGE_NAME_RE.test(path)) return;
        imageEntries.push({ name: path.replace(/\\/g, '/'), entry });
      });
      imageEntries.sort((a, b) => naturalCompareNames(a.name, b.name));
      const first = imageEntries[0];
      if (!first) {
        return { url: '', pageCount: 0, revoke: () => {} };
      }
      const blob = await first.entry.async('blob');
      const imageExt = first.name.split('.').pop()?.toLowerCase() ?? '';
      const typed =
        isImageExtension(imageExt) && blob.type === ''
          ? new Blob([blob], { type: getImageMimeType(imageExt) })
          : blob;
      const url = URL.createObjectURL(typed);
      return {
        url,
        pageCount: imageEntries.length,
        revoke: () => URL.revokeObjectURL(url),
      };
    } catch {
      // Fall through to server extract (7-Zip).
    }
  }

  const opened = await openServerArchivePages(relativePath);
  const first = opened.pages[0];
  if (!first?.url) {
    await opened.revoke();
    return { url: '', pageCount: opened.pages.length, revoke: () => {} };
  }
  return {
    url: first.url,
    pageCount: opened.pages.length,
    revoke: opened.revoke,
  };
}
