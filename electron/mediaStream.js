import fs from 'node:fs';
import { resolvePortablePath } from './appContext.js';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {string | undefined} rangeHeader
 * @param {number} total
 * @returns {{ start: number, end: number } | null}
 */
function parseRangeHeader(rangeHeader, total) {
  if (!rangeHeader?.startsWith('bytes=')) return null;

  const [startPart, endPart] = rangeHeader.slice(6).split('-');
  let start = startPart ? Number.parseInt(startPart, 10) : 0;
  let end = endPart ? Number.parseInt(endPart, 10) : total - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
    return null;
  }

  end = Math.min(end, total - 1);
  return { start, end };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} absolutePath
 * @param {string} contentType
 */
export async function streamAbsoluteFile(req, res, absolutePath, contentType) {
  let stat;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      res.writeHead(404);
      res.end();
      return;
    }
    throw err;
  }

  if (stat.isDirectory()) {
    res.writeHead(400);
    res.end();
    return;
  }

  const total = stat.size;
  const range = parseRangeHeader(req.headers.range, total);

  const origin =
    typeof req.headers.origin === 'string' && req.headers.origin.trim()
      ? req.headers.origin.trim()
      : '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Range, Content-Type, X-Admin-Token, Accept',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    ...(origin !== '*' ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
  };

  if (req.headers.range && !range) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}`, ...corsHeaders });
    res.end();
    return;
  }

  if (range) {
    const { start, end } = range;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
      ...corsHeaders,
    });
    fs.createReadStream(absolutePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Length': total,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    ...corsHeaders,
  });
  fs.createReadStream(absolutePath).pipe(res);
}

const HLS_ASSET_NAME = /^(index\.m3u8|seg\d{5}\.ts)$/;

/**
 * @param {string} playlistText
 * @param {URL} requestUrl
 */
export function rewriteHlsPlaylist(playlistText, requestUrl) {
  const base = new URL(requestUrl.pathname, 'http://127.0.0.1');
  base.searchParams.set('path', requestUrl.searchParams.get('path') ?? '');
  for (const key of ['share', 'token', 'start']) {
    const value = requestUrl.searchParams.get(key);
    if (value) base.searchParams.set(key, value);
  }

  const lines = playlistText.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const name = trimmed.split('?')[0].split(/[/\\]/).pop() || '';
    if (!HLS_ASSET_NAME.test(name) || name === 'index.m3u8') return line;
    base.searchParams.set('hls', name);
    return `${base.pathname}?${base.searchParams.toString()}`;
  });

  return lines.join('\n');
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} absolutePath
 * @param {string} contentType
 * @param {{ rewritePlaylist?: (text: string) => string }} [options]
 */
export async function streamHlsAsset(req, res, absolutePath, contentType, options = {}) {
  const isPlaylist = contentType.includes('mpegurl');
  const maxAttempts = isPlaylist ? 150 : 80;
  let text = '';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (isPlaylist) {
        text = await fs.promises.readFile(absolutePath, 'utf8');
        if (text.includes('#EXTM3U') && (text.endsWith('\n') || text.includes('#EXT-X-ENDLIST'))) {
          break;
        }
      } else {
        const stat = await fs.promises.stat(absolutePath);
        if (stat.isFile() && stat.size >= 8 * 1024) {
          await streamAbsoluteFile(req, res, absolutePath, contentType);
          return;
        }
      }
    } catch {
      // playlist/segment not written yet — keep waiting while FFmpeg starts
    }
    await sleep(100);
  }

  if (!isPlaylist) {
    await streamAbsoluteFile(req, res, absolutePath, contentType);
    return;
  }

  if (!text.includes('#EXTM3U')) {
    res.writeHead(404);
    res.end();
    return;
  }

  const body = options.rewritePlaylist ? options.rewritePlaylist(text) : text;
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin':
      typeof req.headers.origin === 'string' && req.headers.origin.trim()
        ? req.headers.origin.trim()
        : '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(buf);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} relativePath
 * @param {string} contentType
 */
export async function streamFile(req, res, relativePath, contentType) {
  await streamAbsoluteFile(req, res, resolvePortablePath(relativePath), contentType);
}
