/**
 * @param {string} fileName
 * @param {Blob} blob
 */
export function triggerBrowserDownload(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} base64
 * @param {string} [mimeType]
 */
function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = atob(String(base64 ?? ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * @param {string} fileName
 * @param {string} base64
 * @param {string} [mimeType]
 */
export function downloadBase64File(fileName, base64, mimeType = 'application/octet-stream') {
  triggerBrowserDownload(fileName, base64ToBlob(base64, mimeType));
}

/**
 * Drop characters Windows/macOS reject in file names.
 *
 * @param {string} title
 * @param {string} extension
 */
export function exportFileName(title, extension) {
  const stem = String(title || 'NoName').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'NoName';
  return `${stem}.${extension}`;
}
