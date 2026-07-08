import { createHttpEducoworkClient } from './educoworkClient.js';
import { sanitizeSyncHostForBrowser } from './syncHost.js';

/**
 * Electron preload가 없으면 HTTP API 클라이언트를 주입합니다.
 * EduCowork 서버(Electron)가 실행 중이어야 브라우저에서도 동작합니다.
 */
export async function initEducowork() {
  if (window.educowork?.getPaths && window.educowork?.fs?.readDir) {
    return window.educowork;
  }

  sanitizeSyncHostForBrowser();

  const client = createHttpEducoworkClient();
  await client.getPaths();
  window.educowork = client;
  return client;
}
