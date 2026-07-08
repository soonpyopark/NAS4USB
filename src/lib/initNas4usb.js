import { createHttpNas4usbClient } from './nas4usbClient.js';
import { sanitizeSyncHostForBrowser } from './syncHost.js';

/**
 * Electron preload가 없으면 HTTP API 클라이언트를 주입합니다.
 * NAS4USB 서버(Electron)가 실행 중이어야 브라우저에서도 동작합니다.
 */
export async function initNas4usb() {
  if (window.nas4usb?.getPaths && window.nas4usb?.fs?.readDir) {
    return window.nas4usb;
  }

  sanitizeSyncHostForBrowser();

  const client = createHttpNas4usbClient();
  await client.getPaths();
  window.nas4usb = client;
  return client;
}
