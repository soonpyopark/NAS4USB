const STORAGE_KEY = 'educowork.syncHost';

/** @returns {string} */
export function loadSyncHost() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
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
