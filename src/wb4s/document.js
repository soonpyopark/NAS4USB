import { toRoomId } from '../sync/roomId.js';

export const WHITEBOARD_FILE_FORMAT = 'whiteboard4share';
export const WHITEBOARD_FILE_VERSION = 1;

/**
 * @param {string} relativePath
 */
export function getWb4sByDept(relativePath) {
  const parts = String(relativePath ?? '').replace(/\\/g, '/').split('/');
  const first = parts[0];
  return first && first !== '.' ? first : '0000001';
}

/**
 * WhiteBoard4Share collab room id: wb-{byDept}-{whiteboardId}
 * @param {string} relativePath
 */
export function getWb4sCollabRoomId(relativePath) {
  const byDept = getWb4sByDept(relativePath);
  const whiteboardId = toRoomId(relativePath);
  return `wb-${byDept.trim()}-${whiteboardId.trim()}`;
}

/**
 * @param {string} relativePath
 */
export function getWb4sWhiteboardId(relativePath) {
  return toRoomId(relativePath);
}

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

/**
 * @param {string} fileName
 */
export function getWb4sFileStem(fileName) {
  return String(fileName).replace(/\.wb4s$/i, '');
}

/**
 * @param {string} title
 */
export function titleToWb4sFileName(title) {
  const trimmed = String(title ?? '').trim() || '제목 없음';
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '');
  return `${safe || '제목 없음'}.wb4s`;
}

/**
 * @param {string} json
 * @param {string} title
 */
export function wb4sDocumentWithTitle(json, title) {
  const normalized = normalizeWb4sDocument(json);
  const parsed = JSON.parse(normalized);
  parsed.title = title;
  parsed.exportedAt = new Date().toISOString();
  return JSON.stringify(parsed, null, 2);
}
