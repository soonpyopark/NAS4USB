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

function isIpv4Host(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

/**
 * Strip scheme/port/path from a pasted URL. Accepts DNS names and IPv4.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTlsHostname(value) {
  let raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0] ?? '';
  raw = raw.replace(/:\d+$/, '');
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
  if (isIpv4Host(raw)) return raw;
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(raw) &&
    raw !== 'localhost'
  ) {
    return '';
  }
  return raw;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeTlsHostnames(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const host = normalizeTlsHostname(part);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
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
