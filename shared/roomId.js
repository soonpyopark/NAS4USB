/** Sanitize a portable relative path into a stable Y.js room id. */
export function toRoomId(relativePath) {
  const normalized = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalized) return 'default';

  const bytes = new TextEncoder().encode(normalized);

  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  return normalized.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}
