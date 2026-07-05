import { BrowserWindow } from 'electron';

/** @type {number} */
let revision = 0;

/** @type {import('node:http').ServerResponse[]} */
const sseClients = [];

export function getFsRevision() {
  return revision;
}

export function notifyFsChanged() {
  revision += 1;
  const payload = JSON.stringify({ revision, at: Date.now() });

  for (let index = sseClients.length - 1; index >= 0; index -= 1) {
    const client = sseClients[index];
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.splice(index, 1);
    }
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send('fs:changed', revision);
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

  res.write(`data: ${JSON.stringify({ revision, at: Date.now() })}\n\n`);
  sseClients.push(res);

  req.on('close', () => {
    const index = sseClients.indexOf(res);
    if (index >= 0) sseClients.splice(index, 1);
  });

  return true;
}

export function resetFsNotifyState() {
  revision = 0;
  sseClients.length = 0;
}
