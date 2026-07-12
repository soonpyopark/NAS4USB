import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { getSyncHostname, getSyncPort } from './syncServer.js';
import { handleHttpApiRequest } from './httpApi.js';
import { getLocalIPv4Addresses } from './syncServer.js';
import { readEnvFile } from './envConfig.js';
import { parseAllowedHosts } from '../shared/viteHosts.js';
import { rejectIfIpNotAllowed, rejectUpgradeIfIpNotAllowed } from './ipAccessGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { setupWSConnection } = require('y-websocket/bin/utils');

/** @type {{ server: import('node:http').Server, wss: WebSocketServer, vite: import('vite').ViteDevServer } | null} */
let devRuntime = null;

function isViteHmrUpgrade(req) {
  const pathname = (req.url ?? '/').split('?')[0];
  return pathname.startsWith('/@') || pathname === '/vite-hmr';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('node:http').Server} server
 * @param {string} host
 * @param {number} port
 */
function listenOnce(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/**
 * @param {import('node:http').Server} server
 * @param {string} host
 * @param {number} port
 * @param {number} [retries]
 */
async function listenWithRetry(server, host, port, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await listenOnce(server, host, port);
      return;
    } catch (err) {
      const isAddrInUse = err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE';
      if (!isAddrInUse || attempt === retries - 1) {
        throw err;
      }
      const waitMs = 1000 * (attempt + 1);
      console.warn(`[dev] Port ${port} busy, retrying in ${waitMs}ms (${attempt + 1}/${retries - 1})…`);
      await sleep(waitMs);
    }
  }
}

export async function startDevServer() {
  if (devRuntime) {
    return getDevServerInfo();
  }

  const syncPort = getSyncPort();
  const server = http.createServer();
  const projectRoot = path.resolve(__dirname, '..');
  const fileEnv = readEnvFile(projectRoot);
  const allowedHosts = parseAllowedHosts(fileEnv.ALLOWED_HOSTS ?? process.env.ALLOWED_HOSTS);

  const vite = await createViteServer({
    configFile: path.resolve(__dirname, '../vite.config.js'),
    server: {
      port: syncPort,
      strictPort: true,
      host: getSyncHostname() === '0.0.0.0' ? true : getSyncHostname(),
      allowedHosts,
      middlewareMode: { server },
      hmr: {
        port: syncPort + 21670,
        clientPort: syncPort + 21670,
      },
    },
    appType: 'spa',
  });

  server.on('request', async (req, res) => {
    req.setTimeout(180000, () => {
      if (!res.headersSent) {
        res.writeHead(408, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Request timeout' }));
      }
    });

    if (await rejectIfIpNotAllowed(req, res)) return;
    if (await handleHttpApiRequest(req, res)) return;
    vite.middlewares(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (isViteHmrUpgrade(req)) return;

    if (await rejectUpgradeIfIpNotAllowed(req, socket)) return;

    wss.handleUpgrade(req, socket, head, (wsSocket) => {
      const docName = (req.url ?? '/').slice(1).split('?')[0] || 'default';
      console.log(`[sync] peer connected → room "${docName}" from ${req.socket.remoteAddress}`);
      setupWSConnection(wsSocket, req, { docName, gc: true });

      wsSocket.on('close', () => {
        console.log(`[sync] peer disconnected from room "${docName}"`);
      });
    });
  });

  const listenHost = getSyncHostname();
  await listenWithRetry(server, listenHost, syncPort);

  console.log(`[dev] Vite + Y.js unified server on http://${listenHost}:${syncPort}`);
  console.log(`[dev] allowedHosts: ${allowedHosts === true ? 'all (*)' : allowedHosts.join(', ')}`);
  console.log(`[sync] LAN addresses: ${getLocalIPv4Addresses().join(', ') || 'none'}`);

  devRuntime = { server, wss, vite };
  return getDevServerInfo();
}

export function getDevServerInfo() {
  return {
    port: getSyncPort(),
    addresses: getLocalIPv4Addresses(),
    appUrl: `http://127.0.0.1:${getSyncPort()}`,
  };
}

export async function stopDevServer() {
  if (!devRuntime) return;

  devRuntime.wss.close();
  devRuntime.server.close();
  await devRuntime.vite.close();
  devRuntime = null;
}
