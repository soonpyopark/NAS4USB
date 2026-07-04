/**
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {string} base64
 * @param {string} mimeType
 */
export function base64ToObjectUrl(base64, mimeType) {
  const bytes = base64ToBytes(base64);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
