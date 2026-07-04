import { createRhwpStudioClient } from './rhwpStudioClient.js';

const HWP_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * @returns {string}
 */
function getStudioUrl() {
  const url = new URL('rhwp-studio/index.html', window.location.href);
  url.searchParams.set('embed', '1');
  url.searchParams.set('url', '');
  return url.href;
}

/**
 * @param {string} base64
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 */
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {Uint8Array} bytes
 */
export function isHwpBytes(bytes) {
  return bytes.length >= HWP_SIGNATURE.length && HWP_SIGNATURE.every((value, index) => bytes[index] === value);
}

/**
 * @param {string} fileName
 */
export function isHwpFileName(fileName) {
  return /\.hwp$/i.test(fileName ?? '');
}

/**
 * @param {string} fileName
 */
export function toHwpxFileName(fileName) {
  return String(fileName).replace(/\.hwp$/i, '.hwpx');
}

/**
 * HWP 바이너리를 rhwp-studio로 열어 HWPX로 내보냅니다.
 *
 * @param {string} hwpBase64
 * @param {string} [fileName]
 */
export async function convertHwpBase64ToHwpx(hwpBase64, fileName = 'document.hwp') {
  const bytes = base64ToBytes(hwpBase64);
  if (!isHwpBytes(bytes)) {
    throw new Error(`${fileName}은(는) HWP 파일 형식이 아닙니다.`);
  }

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(host);

  let studio = null;

  try {
    studio = await createRhwpStudioClient(host, getStudioUrl(), { width: '1px', height: '1px' });
    await studio.loadFile(bytes, fileName);
    const hwpxBytes = await studio.exportHwpx();
    if (!hwpxBytes?.length) {
      throw new Error(`${fileName}을(를) HWPX로 변환하지 못했습니다.`);
    }
    return bytesToBase64(hwpxBytes);
  } finally {
    studio?.destroy?.();
    host.remove();
  }
}
