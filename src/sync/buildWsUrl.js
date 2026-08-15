import { DEFAULT_SYNC_PORT } from '../../shared/constants.js';
import { formatAccessUrl, httpScheme, isHttpsEnabledFromPage, wsScheme } from '../../shared/httpsConfig.js';
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

function resolveHttps(syncInfo) {
  return isHttpsEnabledFromPage(syncInfo);
}

function resolvePort(syncInfo) {
  return syncInfo?.port ?? DEFAULT_SYNC_PORT;
}

/** Build the HTTP(S) base URL consumed by y-websocket's WebsocketProvider. */
export function getSyncServerUrl(syncInfo) {
  return formatAccessUrl(resolveSyncHost(syncInfo), resolvePort(syncInfo), resolveHttps(syncInfo));
}

export function getSyncWsEndpoint(syncInfo, roomId) {
  const port = resolvePort(syncInfo);
  return `${wsScheme(resolveHttps(syncInfo))}://${resolveSyncHost(syncInfo)}:${port}/${roomId}`;
}

export function getLanWsEndpoints(syncInfo, roomId) {
  const port = resolvePort(syncInfo);
  const scheme = wsScheme(resolveHttps(syncInfo));
  const addresses = syncInfo?.addresses?.length ? syncInfo.addresses : ['127.0.0.1'];
  return addresses.map((address) => `${scheme}://${address}:${port}/${roomId}`);
}

/** @returns {string[]} Browser HTTP(S) access URLs for LAN peers. */
export function buildLanAccessLinks(syncInfo) {
  const port = resolvePort(syncInfo);
  const httpsOn = resolveHttps(syncInfo);
  const configured = loadSyncHost();
  if (configured) {
    return [formatAccessUrl(configured, port, httpsOn)];
  }

  const addresses = syncInfo?.addresses?.length ? syncInfo.addresses : ['127.0.0.1'];
  return addresses.map((address) => formatAccessUrl(address, port, httpsOn));
}

/** @returns {string} Clipboard text: access URL(s) and port. */
export function buildLanAccessClipboardText(syncInfo) {
  const port = resolvePort(syncInfo);
  const links = buildLanAccessLinks(syncInfo);
  const scheme = httpScheme(resolveHttps(syncInfo)).toUpperCase();
  return [...links, `포트: ${port}`, `전송: ${scheme}`].join('\n');
}
