import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { getParentPath, joinRelativePath } from '../fsPaths.js';
import { getFileViewerType } from '../fileViewerType.js';
import { isAudioExtension, isVideoExtension } from '../media/mediaTypes.js';
import { isExternalHttpUrl } from '../openExternal.js';
import { isElectronRenderer } from '../runtime.js';
import { downloadUnknownFile, openUnknownFileExternally } from '../unknownFileOpen.js';
import {
  getTiptapAssetsDir,
  joinTiptapAssetPath,
  linkHrefToAssetFileName,
} from './assetUrls.js';

/**
 * @param {string} fileName
 */
function extensionOf(fileName) {
  const name = String(fileName ?? '');
  const index = name.lastIndexOf('.');
  if (index <= 0) return '';
  return name.slice(index + 1).toLowerCase();
}

/**
 * @param {string} href
 * @param {string} tiptapRelativePath
 * @returns {{
 *   kind: 'external',
 *   url: string,
 * } | {
 *   kind: 'audio' | 'video' | 'file',
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 * } | null}
 */
export function resolveTiptapLinkClick(href, tiptapRelativePath) {
  const raw = String(href ?? '').trim();
  if (!raw) return null;
  if (isExternalHttpUrl(raw)) return { kind: 'external', url: raw };

  const fileName = linkHrefToAssetFileName(raw, tiptapRelativePath);
  if (!fileName) return null;
  const extension = extensionOf(fileName);
  const relativePath = joinTiptapAssetPath(tiptapRelativePath, fileName);
  if (isAudioExtension(extension)) {
    return { kind: 'audio', relativePath, fileName, extension };
  }
  if (isVideoExtension(extension)) {
    return { kind: 'video', relativePath, fileName, extension };
  }
  return { kind: 'file', relativePath, fileName, extension };
}

/**
 * Open a packaged attachment in the app editor, the OS, or as a download.
 *
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 * }} entry
 * @param {(entry: object) => void | Promise<boolean>} [onOpenFile]
 */
export async function openTiptapAttachment(entry, onOpenFile) {
  const viewerType = getFileViewerType(entry.extension);
  if (viewerType && onOpenFile) {
    const opened = await onOpenFile({
      relativePath: entry.relativePath,
      name: entry.fileName,
      extension: entry.extension,
      isDirectory: false,
    });
    if (opened !== false) return;
  }

  const fileEntry = {
    relativePath: entry.relativePath,
    name: entry.fileName,
    isDirectory: false,
  };
  if (isElectronRenderer() && window.nas4usb?.fs?.openPath) {
    await openUnknownFileExternally(fileEntry);
    return;
  }
  await downloadUnknownFile(fileEntry);
}

/**
 * @param {string} relativePath
 */
async function pathExists(relativePath) {
  try {
    return Boolean(await window.nas4usb.fs.exists(relativePath));
  } catch {
    return false;
  }
}

/**
 * Sidecar first, then the .tiptap ZIP, then a file next to the document.
 * @param {string} tiptapRelativePath
 * @param {string} fileName
 */
export async function ensureTiptapAssetAvailable(tiptapRelativePath, fileName) {
  const sidecarPath = joinTiptapAssetPath(tiptapRelativePath, fileName);
  if (await pathExists(sidecarPath)) return sidecarPath;

  try {
    const base64 = await window.nas4usb.fs.readFile(tiptapRelativePath);
    const bytes = base64ToBytes(base64);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const zip = await JSZip.loadAsync(bytes);
      const entry = zip.file(`assets/${fileName}`);
      if (entry) {
        const assetBytes = await entry.async('uint8array');
        await window.nas4usb.fs.mkdir(getTiptapAssetsDir(tiptapRelativePath));
        await window.nas4usb.fs.writeFile(sidecarPath, bytesToBase64(assetBytes));
        return sidecarPath;
      }
    }
  } catch {
    // package missing or not a zip — try siblings
  }

  const parent = getParentPath(tiptapRelativePath);
  const neighbors = [
    joinRelativePath(parent, fileName),
    joinRelativePath(joinRelativePath(parent, 'assets'), fileName),
    joinRelativePath(joinRelativePath(parent, 'asset'), fileName),
  ];
  for (const candidate of neighbors) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(
    `"${fileName}" 파일을 찾을 수 없습니다.\n\n문서 첨부 폴더와 .tiptap 패키지에 없습니다. 첨부를 다시 넣거나 같은 폴더에 파일을 넣어 주세요.`,
  );
}
