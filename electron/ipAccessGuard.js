import { getAllowedIpCidrs } from './settingsService.js';
import {
  getClientIpFromRequest,
  ipBlockedHtml,
  isIpAllowed,
} from './ipAllowlist.js';

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
  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(ipBlockedHtml(clientIp));
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
  socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  socket.destroy();
  return true;
}
