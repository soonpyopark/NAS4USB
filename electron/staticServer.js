import fs from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // pdf.js worker is shipped as .mjs; browsers reject module workers served as octet-stream
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  // pdf.js CMap / Type1 standard fonts
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} distRoot
 * @returns {Promise<boolean>}
 */
export async function serveStaticDist(req, res, distRoot) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  const requestPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  let filePath = path.join(distRoot, requestPath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // Never SPA-fallback binary/module assets — pdf.js wasm/worker must 404, not get index.html.
    const ext = path.extname(requestPath).toLowerCase();
    const noSpaFallback = new Set([
      '.wasm',
      '.mjs',
      '.js',
      '.css',
      '.map',
      '.json',
      '.woff',
      '.woff2',
      '.ttf',
      '.otf',
      '.bcmap',
      '.pfb',
      '.png',
      '.jpg',
      '.jpeg',
      '.svg',
      '.ico',
      '.gif',
      '.webp',
    ]);
    if (requestPath.startsWith('rhwp-studio/') || noSpaFallback.has(ext)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    filePath = path.join(distRoot, 'index.html');
  }

  if (!filePath.startsWith(distRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(content);
    return true;
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return true;
  }
}
