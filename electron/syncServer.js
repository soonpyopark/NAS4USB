import { APP_NAME, DEFAULT_SYNC_PORT } from '../shared/constants.js';
import { formatAccessUrl } from '../shared/httpsConfig.js';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { handleHttpApiRequest } from './httpApi.js';
import { serveStaticDist } from './staticServer.js';
import { rejectIfIpNotAllowed, rejectUpgradeIfIpNotAllowed } from './ipAccessGuard.js';
import { getLocalIPv4Addresses } from './lanAddresses.js';
import { createAppHttpServer } from './tlsCerts.js';

const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

/** @type {number} */
let syncPort = DEFAULT_SYNC_PORT;
/** @type {string} */
let syncHostname = '0.0.0.0';
/** @type {boolean} */
let syncHttpsEnabled = false;

let syncServer = null;
let syncWss = null;
/** Tracked so a restart can free the port instead of waiting on keep-alive peers. */
const openSockets = new Set();

export { getLocalIPv4Addresses };

/** @type {string | null} */
let staticDistRoot = null;

/**
 * @param {{ port?: number, hostname?: string, httpsEnabled?: boolean }} [options]
 */
export function configureSyncServer(options = {}) {
  if (options.port != null) {
    syncPort = options.port;
  }
  if (options.hostname != null) {
    syncHostname = options.hostname;
  }
  if (options.httpsEnabled != null) {
    syncHttpsEnabled = Boolean(options.httpsEnabled);
  }
}

function syncListenInfo() {
  return {
    port: syncPort,
    addresses: getLocalIPv4Addresses(),
    https: syncHttpsEnabled,
    appUrl: formatAccessUrl('127.0.0.1', syncPort, syncHttpsEnabled),
  };
}

/**
 * @param {string} [distRoot]
 */
export async function startSyncServer(distRoot) {
  if (syncServer) {
    return syncListenInfo();
  }

  staticDistRoot = distRoot ?? null;

  syncServer = await createAppHttpServer(syncHttpsEnabled, async (req, res) => {
    if (await rejectIfIpNotAllowed(req, res)) return;
    if (await handleHttpApiRequest(req, res)) return;

    if (staticDistRoot && (await serveStaticDist(req, res, staticDistRoot))) {
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${APP_NAME} sync server`);
  });

  syncServer.on('connection', (socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });

  syncWss = new WebSocketServer({ noServer: true });

  syncServer.on('upgrade', async (req, socket, head) => {
    if (await rejectUpgradeIfIpNotAllowed(req, socket)) return;
    syncWss.handleUpgrade(req, socket, head, (wsSocket) => {
      syncWss.emit('connection', wsSocket, req);
    });
  });

  syncWss.on('connection', (socket, req) => {
    const docName = (req.url ?? '/').slice(1).split('?')[0] || 'default';
    console.log(`[sync] peer connected → room "${docName}" from ${req.socket.remoteAddress}`);
    setupWSConnection(socket, req, { docName, gc: true });

    socket.on('close', () => {
      console.log(`[sync] peer disconnected from room "${docName}"`);
    });
  });

  syncServer.listen(syncPort, syncHostname, () => {
    const scheme = syncHttpsEnabled ? 'https' : 'http';
    console.log(`[sync] Y.js broker listening on ${scheme}://${syncHostname}:${syncPort}`);
    console.log(`[sync] LAN addresses: ${getLocalIPv4Addresses().join(', ') || 'none'}`);
  });

  return syncListenInfo();
}

export function stopSyncServer() {
  syncWss?.close();
  syncServer?.close();
  for (const socket of openSockets) {
    socket.destroy();
  }
  openSockets.clear();
  syncWss = null;
  syncServer = null;
}

export function getSyncPort() {
  return syncPort;
}

export function getSyncHostname() {
  return syncHostname;
}

export function getSyncHttpsEnabled() {
  return syncHttpsEnabled;
}
