import {
  getAllowedIpCidrs,
  getShareLinksBypassIpAllowlist,
} from './settingsService.js';
import {
  getClientIpFromRequest,
  ipBlockedHtml,
  isIpAllowed,
} from './ipAllowlist.js';
import { resolveShareToken } from './shareLinkService.js';

/** Cookie set after a valid `?share=` hit so follow-up asset/WS requests can bypass IP. */
const SHARE_IP_BYPASS_COOKIE = 'nas4usb_share_ip';

/**
 * @param {string | undefined} cookieHeader
 * @returns {Record<string, string>}
 */
function parseCookies(cookieHeader) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of String(cookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function getShareTokenFromRequest(req) {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const fromQuery = url.searchParams.get('share')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // ignore malformed URL
  }
  const cookies = parseCookies(req.headers.cookie);
  return String(cookies[SHARE_IP_BYPASS_COOKIE] ?? '').trim();
}

/**
 * @param {string} token
 */
function shareBypassCookieHeader(token) {
  return `${SHARE_IP_BYPASS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string | null>} valid token when share-link IP bypass applies
 */
async function resolveShareIpBypassToken(req) {
  if (!(await getShareLinksBypassIpAllowlist())) return null;
  const token = getShareTokenFromRequest(req);
  if (!token) return null;
  const entry = await resolveShareToken(token);
  return entry ? token : null;
}

/**
 * Reject HTTP request when client IP is not on the allowlist.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<boolean>} true if blocked (response already sent)
 */
export async function rejectIfIpNotAllowed(req, res) {
  const allowed = await getAllowedIpCidrs();
  const clientIp = getClientIpFromRequest(req);
  if (isIpAllowed(clientIp, allowed)) {
    return false;
  }

  const shareToken = await resolveShareIpBypassToken(req);
  if (shareToken) {
    // Persist bypass for subsequent asset / API / WS requests without ?share=.
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (url.searchParams.get('share')?.trim()) {
        res.setHeader('Set-Cookie', shareBypassCookieHeader(shareToken));
      }
    } catch {
      res.setHeader('Set-Cookie', shareBypassCookieHeader(shareToken));
    }
    return false;
  }

  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(ipBlockedHtml());
  return true;
}

/**
 * Reject WebSocket upgrade when client IP is not on the allowlist.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:stream').Duplex} socket
 * @returns {Promise<boolean>} true if blocked (socket destroyed)
 */
export async function rejectUpgradeIfIpNotAllowed(req, socket) {
  const allowed = await getAllowedIpCidrs();
  const clientIp = getClientIpFromRequest(req);
  if (isIpAllowed(clientIp, allowed)) {
    return false;
  }

  if (await resolveShareIpBypassToken(req)) {
    return false;
  }

  socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  socket.destroy();
  return true;
}
