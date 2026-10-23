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
 * HTML must revalidate so clients pick up new hashed asset names after rebuild.
 * Fingerprinted Vite chunks under `assets/` can be cached forever.
 * Unhashed public files (icons, etc.) revalidate like HTML.
 *
 * @param {string} relativePosix path relative to dist root, `/`-separated
 * @param {string} ext lowercase extension including dot
 */
function cacheControlFor(relativePosix, ext) {
  if (ext === '.html') return 'no-cache';
  if (relativePosix === 'assets' || relativePosix.startsWith('assets/') || relativePosix.includes('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

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
      // Avoid sticky 404s when a rebuild renames hashed chunks mid-session.
      res.writeHead(404, { 'Cache-Control': 'no-store' });
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
    const relativePosix = path.relative(distRoot, filePath).split(path.sep).join('/');
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': cacheControlFor(relativePosix, ext),
    });
    res.end(content);
    return true;
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' });
    res.end('Not found');
    return true;
  }
}
