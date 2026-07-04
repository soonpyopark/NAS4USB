import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { DEFAULT_SYNC_PORT } from '../shared/constants.js';
import { handleHttpApiRequest } from './httpApi.js';
import { getLocalIPv4Addresses } from './syncServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

/** @type {{ server: import('node:http').Server, wss: WebSocketServer, vite: import('vite').ViteDevServer } | null} */
let devRuntime = null;

function isViteHmrUpgrade(req) {
  const pathname = (req.url ?? '/').split('?')[0];
  return pathname.startsWith('/@') || pathname === '/vite-hmr';
}

export async function startDevServer() {
  if (devRuntime) {
    return getDevServerInfo();
  }

  const server = http.createServer();

  const vite = await createViteServer({
    configFile: path.resolve(__dirname, '../vite.config.js'),
    server: {
      port: DEFAULT_SYNC_PORT,
      strictPort: true,
      middlewareMode: { server },
    },
    appType: 'spa',
  });

  server.on('request', async (req, res) => {
    if (await handleHttpApiRequest(req, res)) return;
    vite.middlewares(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (isViteHmrUpgrade(req)) return;

    wss.handleUpgrade(req, socket, head, (wsSocket) => {
      const docName = (req.url ?? '/').slice(1).split('?')[0] || 'default';
      console.log(`[sync] peer connected → room "${docName}" from ${req.socket.remoteAddress}`);
      setupWSConnection(wsSocket, req, { docName, gc: true });

      wsSocket.on('close', () => {
        console.log(`[sync] peer disconnected from room "${docName}"`);
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(DEFAULT_SYNC_PORT, '0.0.0.0', () => resolve());
    server.on('error', reject);
  });

  console.log(`[dev] Vite + Y.js unified server on http://0.0.0.0:${DEFAULT_SYNC_PORT}`);
  console.log(`[sync] LAN addresses: ${getLocalIPv4Addresses().join(', ') || 'none'}`);

  devRuntime = { server, wss, vite };
  return getDevServerInfo();
}

export function getDevServerInfo() {
  return {
    port: DEFAULT_SYNC_PORT,
    addresses: getLocalIPv4Addresses(),
    appUrl: `http://127.0.0.1:${DEFAULT_SYNC_PORT}`,
  };
}

export async function stopDevServer() {
  if (!devRuntime) return;

  devRuntime.wss.close();
  devRuntime.server.close();
  await devRuntime.vite.close();
  devRuntime = null;
}
