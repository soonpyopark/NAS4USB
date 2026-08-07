import { downloadBase64File } from './browserDownload.js';
import { isElectronRenderer } from './runtime.js';

/**
 * @typedef {{ fileName: string, absolutePath?: string, downloaded?: boolean }} SaveResult
 */

/**
 * Save an exported file to the user's PC.
 *
 * Electron asks for a destination folder through the native dialog. Browsers
 * download to their configured folder instead: the File System Access API
 * refuses system-ish folders and is unavailable outside a secure context, so
 * asking there would fail for LAN clients and confuse everyone else.
 *
 * @param {{ fileName: string, base64: string, mimeType?: string, title?: string }} params
 * @returns {Promise<SaveResult | null>} null when the user cancels
 */
export async function saveFileToPickedFolder({ fileName, base64, mimeType, title }) {
  if (isElectronRenderer()) {
    const directory = await window.nas4usb.dialog.pickDirectory({
      title: title ?? '저장할 폴더 선택',
    });
    if (!directory) return null;
    return window.nas4usb.fs.writeFileAbsolute({ directory, fileName, base64 });
  }

  downloadBase64File(fileName, base64, mimeType);
  return { fileName, downloaded: true };
}
