import fs from 'node:fs';
import { resolvePortablePath } from './appContext.js';

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
 * @param {string} relativePath
 * @param {string} contentType
 */
export async function streamFile(req, res, relativePath, contentType) {
  const absolute = resolvePortablePath(relativePath);

  let stat;
  try {
    stat = await fs.promises.stat(absolute);
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

  if (req.headers.range && !range) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
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
    });
    fs.createReadStream(absolute, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Length': total,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(absolute).pipe(res);
}
