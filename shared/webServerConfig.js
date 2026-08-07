import { DEFAULT_SYNC_PORT } from './constants.js';

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
 * Stored setting wins over `.env`, which wins over the built-in default.
 *
 * @param {unknown} preferred
 * @param {string | null} [envRaw]
 */
export function resolveWebServerPort(preferred, envRaw) {
  return normalizeWebServerPort(preferred) ?? normalizeWebServerPort(envRaw) ?? DEFAULT_SYNC_PORT;
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
