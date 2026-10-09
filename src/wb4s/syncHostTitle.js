import {
  base64ToUtf8,
  normalizeWb4sDocument,
  utf8ToBase64,
  wb4sDocumentWithFileName,
} from './document.js';

/**
 * After a NAS folder rename, keep the .wb4s JSON `title` aligned with the file stem.
 * Failures are ignored — the editor still applies the stem on the next open.
 *
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function syncWb4sDocumentTitleFromFileName(relativePath, fileName) {
  if (!relativePath || !/\.wb4s$/i.test(String(fileName || relativePath))) return;
  try {
    const base64 = await window.nas4usb?.fs?.readFile?.(relativePath);
    if (!base64) return;
    const text = base64ToUtf8(base64);
    const next = wb4sDocumentWithFileName(text, fileName);
    if (next === normalizeWb4sDocument(text)) return;
    await window.nas4usb.fs.writeFile(relativePath, utf8ToBase64(next));
  } catch {
    // Rename already succeeded.
  }
}
