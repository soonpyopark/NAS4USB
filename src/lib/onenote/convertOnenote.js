import { createHttpNas4usbClient } from '../nas4usbClient.js';

/** @type {ReturnType<typeof createHttpNas4usbClient> | null} */
let httpClient = null;

/**
 * Ask the host to turn a OneNote file into page HTML.
 *
 * Prefers the Electron bridge, but falls back to the LAN HTTP route so a
 * renderer running against an older preload still converts.
 *
 * @param {{ base64: string, fileName: string }} payload
 */
export async function convertOnenoteFile(payload) {
  const bridge = window.nas4usb?.tiptap?.importOnenote;
  if (typeof bridge === 'function') {
    return bridge(payload);
  }

  httpClient ??= createHttpNas4usbClient();
  const overHttp = httpClient?.tiptap?.importOnenote;
  if (typeof overHttp !== 'function') {
    throw new Error('원노트 변환을 이 호스트에서 사용할 수 없습니다.');
  }
  return overHttp(payload);
}
