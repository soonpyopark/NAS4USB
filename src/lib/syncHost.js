const STORAGE_KEY = 'educowork.syncHost';

/** @returns {string} */
export function loadSyncHost() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
}

/**
 * LAN 브라우저에서 localhost로 저장된 syncHost는 무시합니다.
 */
export function sanitizeSyncHostForBrowser() {
  if (typeof window === 'undefined') return;

  const pageHost = window.location.hostname?.trim() ?? '';
  const configured = loadSyncHost();
  if (!configured || !pageHost) return;

  const isLocalPage = pageHost === '127.0.0.1' || pageHost === 'localhost';
  const isLocalConfig = configured === '127.0.0.1' || configured === 'localhost';

  if (!isLocalPage && isLocalConfig) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/** @param {string} host */
export function saveSyncHost(host) {
  if (typeof window === 'undefined') return;
  const trimmed = host.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
}
