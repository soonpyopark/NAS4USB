import { DEFAULT_SYNC_PORT } from '../shared/constants.js';
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { handleHttpApiRequest } from './httpApi.js';
import { serveStaticDist } from './staticServer.js';

const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

const SYNC_PORT = DEFAULT_SYNC_PORT;

let syncServer = null;
let syncWss = null;

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
 * @param {string} [distRoot]
 */
export function startSyncServer(distRoot) {
  if (syncServer) {
    return { port: SYNC_PORT, addresses: getLocalIPv4Addresses() };
  }

  staticDistRoot = distRoot ?? null;

  syncServer = http.createServer(async (req, res) => {
    if (await handleHttpApiRequest(req, res)) return;

    if (staticDistRoot && (await serveStaticDist(req, res, staticDistRoot))) {
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('EduCowork sync server');
  });

  syncWss = new WebSocketServer({ server: syncServer });

  syncWss.on('connection', (socket, req) => {
    const docName = (req.url ?? '/').slice(1).split('?')[0] || 'default';
    console.log(`[sync] peer connected → room "${docName}" from ${req.socket.remoteAddress}`);
    setupWSConnection(socket, req, { docName, gc: true });

    socket.on('close', () => {
      console.log(`[sync] peer disconnected from room "${docName}"`);
    });
  });

  syncServer.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`[sync] Y.js broker listening on 0.0.0.0:${SYNC_PORT}`);
    console.log(`[sync] LAN addresses: ${getLocalIPv4Addresses().join(', ') || 'none'}`);
  });

  return { port: SYNC_PORT, addresses: getLocalIPv4Addresses() };
}

export function stopSyncServer() {
  syncWss?.close();
  syncServer?.close();
  syncWss = null;
  syncServer = null;
}

export function getSyncPort() {
  return SYNC_PORT;
}
