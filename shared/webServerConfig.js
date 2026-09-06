import { DEFAULT_MAC_SYNC_PORT, DEFAULT_SYNC_PORT } from './constants.js';

/** @typedef {'local' | 'lan'} WebServerMode */

/**
 * Valid TCP port, or null when unset / out of range.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeWebServerPort(value) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) return null;
  const port = Math.trunc(parsed);
  if (port < 1 || port > 65535) return null;
  return port;
}

/**
 * Built-in port when settings and `.env` are both unset.
 * Packaged macOS uses 3011 so it can run next to Windows / `npm run dev` (3009).
 *
 * @param {{ platform?: string, packaged?: boolean }} [options]
 */
export function fallbackSyncPort(options = {}) {
  const platform = options.platform ?? (typeof process !== 'undefined' ? process.platform : '');
  if (options.packaged && platform === 'darwin') return DEFAULT_MAC_SYNC_PORT;
  return DEFAULT_SYNC_PORT;
}

/**
 * Stored setting wins over `.env`, which wins over the built-in default.
 *
 * @param {unknown} preferred
 * @param {string | null} [envRaw]
 * @param {number} [fallback]
 */
export function resolveWebServerPort(preferred, envRaw, fallback = DEFAULT_SYNC_PORT) {
  return normalizeWebServerPort(preferred) ?? normalizeWebServerPort(envRaw) ?? fallback;
}

/**
 * @param {unknown} value
 * @returns {WebServerMode | null}
 */
export function normalizeWebServerMode(value) {
  return value === 'lan' || value === 'local' ? value : null;
}

/**
 * Stored Local/Web choice wins over the `.env` HOSTNAME hint.
 *
 * @param {unknown} preferred
 * @param {string | null} [envHostname]
 * @returns {WebServerMode}
 */
export function resolveWebServerMode(preferred, envHostname) {
  const stored = normalizeWebServerMode(preferred);
  if (stored) return stored;
  const hostname = String(envHostname ?? '').trim();
  if (hostname === '0.0.0.0' || hostname === '*' || hostname === '+') return 'lan';
  return 'local';
}

/**
 * @param {WebServerMode} mode
 */
export function hostnameForWebServerMode(mode) {
  return mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
}

/**
 * @param {string | null | undefined} hostname
 * @returns {WebServerMode}
 */
export function webServerModeForHostname(hostname) {
  const value = String(hostname ?? '').trim();
  return value === '0.0.0.0' || value === '*' || value === '+' ? 'lan' : 'local';
}
