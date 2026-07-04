export const WHITEBOARD_FILE_FORMAT = 'whiteboard4share';
export const WHITEBOARD_FILE_VERSION = 1;

/**
 * @param {string} [title]
 */
export function createEmptyWb4sDocument(title = '제목 없음') {
  return JSON.stringify(
    {
      format: WHITEBOARD_FILE_FORMAT,
      version: WHITEBOARD_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      title,
      paths: [],
      images: [],
      texts: [],
      tables: [],
    },
    null,
    2,
  );
}

/**
 * @param {string} base64
 */
export function base64ToUtf8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * @param {string} text
 */
export function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {string} text
 */
export function normalizeWb4sDocument(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return createEmptyWb4sDocument();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.format === WHITEBOARD_FILE_FORMAT) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // fall through
  }
  return createEmptyWb4sDocument();
}
