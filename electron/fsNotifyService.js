import { BrowserWindow } from 'electron';

/** @type {number} */
let revision = 0;

/** @type {string[]} */
let lastChangedPaths = [];

/** @type {import('node:http').ServerResponse[]} */
const sseClients = [];

/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;

const SSE_HEARTBEAT_MS = 25_000;

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (let index = sseClients.length - 1; index >= 0; index -= 1) {
      const client = sseClients[index];
      try {
        client.write(': keepalive\n\n');
      } catch {
        sseClients.splice(index, 1);
      }
    }
    if (sseClients.length === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, SSE_HEARTBEAT_MS);
}

function writeSseData(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * @param {string | string[] | { paths?: string | string[] } | undefined} changed
 * @returns {string[]}
 */
function normalizeChangedPaths(changed) {
  if (!changed) return [];
  if (typeof changed === 'string') return changed ? [changed] : [];
  if (Array.isArray(changed)) return changed.filter((value) => typeof value === 'string' && value.trim());
  if (Array.isArray(changed.paths)) {
    return changed.paths.filter((value) => typeof value === 'string' && value.trim());
  }
  if (typeof changed.paths === 'string' && changed.paths.trim()) {
    return [changed.paths.trim()];
  }
  return [];
}

export function getFsRevision() {
  return revision;
}

export function getFsRevisionPayload() {
  return { revision, paths: lastChangedPaths };
}

/**
 * @param {string | string[] | { paths?: string | string[] } | undefined} [changed]
 */
export function notifyFsChanged(changed) {
  const paths = normalizeChangedPaths(changed);
  lastChangedPaths = paths;
  revision += 1;
  const payload = { revision, at: Date.now(), paths };

  for (let index = sseClients.length - 1; index >= 0; index -= 1) {
    const client = sseClients[index];
    try {
      writeSseData(client, payload);
    } catch {
      sseClients.splice(index, 1);
    }
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('fs:changed', payload);
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean}
 */
export function handleFsEventsRequest(req, res) {
  if ((req.method ?? 'GET') !== 'GET') {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  writeSseData(res, getFsRevisionPayload());
  sseClients.push(res);
  startHeartbeat();

  req.on('close', () => {
    const index = sseClients.indexOf(res);
    if (index >= 0) sseClients.splice(index, 1);
  });

  return true;
}

export function resetFsNotifyState() {
  revision = 0;
  lastChangedPaths = [];
  sseClients.length = 0;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
