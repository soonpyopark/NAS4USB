import { base64ToBytes } from './bytes.js';
import { readWorkspacePlainBase64 } from './filePassword/io.js';
import { entryExtensionOf } from './filePassword/secPaths.js';
import { isExternalHttpUrl, openExternalUrl } from './openExternal.js';

const SHORTCUT_EXTENSIONS = new Set(['url', 'website', 'webloc']);

/**
 * @param {string | null | undefined} extension
 */
export function isInternetShortcutExtension(extension) {
  const ext = String(extension ?? '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  return SHORTCUT_EXTENSIONS.has(ext);
}

/**
 * @param {{ name?: string, relativePath?: string, extension?: string } | null | undefined} entry
 */
export function isInternetShortcutEntry(entry) {
  return isInternetShortcutExtension(entryExtensionOf(entry) || entry?.extension);
}

/**
 * @param {Uint8Array} bytes
 */
function decodeShortcutBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Windows `.url` / `.website` and macOS `.webloc` (text plist).
 * @param {string} text
 * @returns {string | null}
 */
export function parseInternetShortcutUrl(text) {
  const raw = String(text ?? '');
  const ini = /^\s*URL\s*=\s*(.+?)\s*$/im.exec(raw);
  if (ini?.[1]) return ini[1].trim();
  const plist = /<key>\s*URL\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/i.exec(raw);
  if (plist?.[1]) return plist[1].trim();
  const bare = raw.trim();
  if (isExternalHttpUrl(bare) && !/\s/.test(bare)) return bare;
  return null;
}

/**
 * @param {{ relativePath: string }} entry
 */
export async function openInternetShortcutEntry(entry) {
  const base64 = await readWorkspacePlainBase64(entry.relativePath);
  const url = parseInternetShortcutUrl(decodeShortcutBytes(base64ToBytes(base64)));
  if (!isExternalHttpUrl(url)) {
    throw new Error('URL 파일에서 웹 주소를 찾지 못했습니다.');
  }
  await openExternalUrl(url);
}
