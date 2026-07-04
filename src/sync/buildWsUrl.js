import { DEFAULT_SYNC_PORT } from '../../shared/constants.js';
import { loadSyncHost } from '../lib/syncHost.js';

function resolveSyncHost(syncInfo) {
  const configured = loadSyncHost();
  if (configured) return configured;

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  return syncInfo?.addresses?.[0] ?? '127.0.0.1';
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
