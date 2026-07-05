import { DEFAULT_SYNC_PORT } from '../../shared/constants.js';
import { loadSyncHost } from '../lib/syncHost.js';

function resolveSyncHost(syncInfo) {
  const pageHost =
    typeof window !== 'undefined' ? window.location?.hostname?.trim() : '';

  // LAN 브라우저: 주소창의 IP/호스트를 Y.js 서버로 사용 (localStorage 127.0.0.1 무시)
  if (pageHost && pageHost !== '127.0.0.1' && pageHost !== 'localhost') {
    return pageHost;
  }

  const configured = loadSyncHost();
  if (configured) return configured;

  if (pageHost) return pageHost;

  // file:// Electron 등 — LAN IP로는 Windows에서 로컬 WS 접속이 실패할 수 있음
  return '127.0.0.1';
}

/** Build the HTTP base URL consumed by y-websocket's WebsocketProvider. */
export function getSyncServerUrl(syncInfo) {
  const port = syncInfo?.port ?? DEFAULT_SYNC_PORT;
  return `http://${resolveSyncHost(syncInfo)}:${port}`;
}

export function getSyncWsEndpoint(syncInfo, roomId) {
  const port = syncInfo?.port ?? DEFAULT_SYNC_PORT;
  return `ws://${resolveSyncHost(syncInfo)}:${port}/${roomId}`;
}

export function getLanWsEndpoints(syncInfo, roomId) {
  const port = syncInfo?.port ?? DEFAULT_SYNC_PORT;
  const addresses = syncInfo?.addresses?.length ? syncInfo.addresses : ['127.0.0.1'];
  return addresses.map((address) => `ws://${address}:${port}/${roomId}`);
}

/** @returns {string[]} Browser HTTP access URLs for LAN peers. */
export function buildLanAccessLinks(syncInfo) {
  const port = syncInfo?.port ?? DEFAULT_SYNC_PORT;
  const configured = loadSyncHost();
  if (configured) {
    return [`http://${configured}:${port}`];
  }

  const addresses = syncInfo?.addresses?.length ? syncInfo.addresses : ['127.0.0.1'];
  return addresses.map((address) => `http://${address}:${port}`);
}

/** @returns {string} Clipboard text: access URL(s) and port. */
export function buildLanAccessClipboardText(syncInfo) {
  const port = syncInfo?.port ?? DEFAULT_SYNC_PORT;
  const links = buildLanAccessLinks(syncInfo);
  return [...links, `포트: ${port}`].join('\n');
}
