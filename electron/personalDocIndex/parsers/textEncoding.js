/**
 * Decode local text the way Doc Search Engine does: UTF-8 / UTF-16 / EUC-KR.
 * @param {Buffer | Uint8Array} buffer
 */
export function decodeTextBytes(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > 0 && bad / Math.max(utf8.length, 1) > 0.01) {
    try {
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
