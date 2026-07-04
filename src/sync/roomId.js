/** Sanitize a portable relative path into a stable Y.js room id. */
export function toRoomId(relativePath) {
  const normalized = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalized) return 'default';

  if (typeof globalThis.btoa === 'function') {
    const bytes = new TextEncoder().encode(normalized);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  return normalized.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}
