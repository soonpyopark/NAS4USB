import { APP_NAME, DEFAULT_SYNC_PORT } from '../shared/constants.js';
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { handleHttpApiRequest } from './httpApi.js';
import { serveStaticDist } from './staticServer.js';
import { rejectIfIpNotAllowed, rejectUpgradeIfIpNotAllowed } from './ipAccessGuard.js';

const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

/** @type {number} */
let syncPort = DEFAULT_SYNC_PORT;
/** @type {string} */
let syncHostname = '0.0.0.0';

let syncServer = null;
let syncWss = null;
/** Tracked so a restart can free the port instead of waiting on keep-alive peers. */
const openSockets = new Set();

export function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

/** @type {string | null} */
let staticDistRoot = null;

/**
 * @param {{ port?: number, hostname?: string }} [options]
 */
export function configureSyncServer(options = {}) {
  if (options.port != null) {
    syncPort = options.port;
  }
  if (options.hostname != null) {
    syncHostname = options.hostname;
  }
}

/**
 * @param {string} [distRoot]
 */
export function startSyncServer(distRoot) {
  if (syncServer) {
    return { port: syncPort, addresses: getLocalIPv4Addresses() };
  }

  staticDistRoot = distRoot ?? null;

  syncServer = http.createServer(async (req, res) => {
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
    console.log(`[sync] Y.js broker listening on ${syncHostname}:${syncPort}`);
    console.log(`[sync] LAN addresses: ${getLocalIPv4Addresses().join(', ') || 'none'}`);
  });

  return { port: syncPort, addresses: getLocalIPv4Addresses() };
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
