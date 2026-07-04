import { base64ToBytes, bytesToBase64 } from '../bytes.js';

/**
 * @param {string} base64
 * @returns {string}
 */
export function decodeTextBase64(base64) {
  if (!base64) return '';
  const bytes = base64ToBytes(base64);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function encodeTextBase64(text) {
  const bytes = new TextEncoder().encode(text ?? '');
  return bytesToBase64(bytes);
}

/**
 * @param {string} text
 */
export function countLines(text) {
  if (!text) return 1;
  return text.split('\n').length;
}

/**
 * @param {string} text
 * @param {number} offset
 */
export function getLineColumn(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safeOffset);
  const lines = before.split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { line, column };
}
