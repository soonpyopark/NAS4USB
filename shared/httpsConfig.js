/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeHttpsEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * @param {boolean} httpsEnabled
 */
export function httpScheme(httpsEnabled) {
  return httpsEnabled ? 'https' : 'http';
}

/**
 * @param {boolean} httpsEnabled
 */
export function wsScheme(httpsEnabled) {
  return httpsEnabled ? 'wss' : 'ws';
}

/**
 * @param {string} host
 * @param {number} port
 * @param {boolean} httpsEnabled
 */
export function formatAccessUrl(host, port, httpsEnabled) {
  return `${httpScheme(httpsEnabled)}://${host}:${port}`;
}

/**
 * Prefer the explicit server flag, then the page scheme (LAN browser).
 *
 * @param {{ https?: boolean } | null | undefined} syncInfo
 */
export function isHttpsEnabledFromPage(syncInfo) {
  if (syncInfo && typeof syncInfo.https === 'boolean') return syncInfo.https;
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') return true;
  return false;
}
