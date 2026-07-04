import path from 'node:path';
import {
  getAppPaths,
  getDataRoot,
  getPortableRoot,
  getSyncInfo,
  getTempPath,
} from './appContext.js';
import * as fsService from './fsService.js';
import {
  closeWorkspace,
  commitWorkspace,
  renameWorkspace,
  openWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
} from './tempWorkspace.js';
import { getEditorCoresStatus, updateEditorCores } from './editorUpdater.js';

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<boolean>} true if request was handled
 */
export async function handleHttpApiRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) {
    return false;
  }

  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && url.pathname === '/api/app/paths') {
      sendJson(res, 200, getAppPaths());
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/sync/info') {
      sendJson(res, 200, getSyncInfo());
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readDir') {
      sendJson(res, 200, await fsService.readDir(url.searchParams.get('path') ?? '.'));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/mkdir') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.mkdir(body.path));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/delete') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.deletePath(body.path));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/rename') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.renamePath(body.from, body.to));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/exists') {
      sendJson(res, 200, await fsService.pathExists(url.searchParams.get('path') ?? ''));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readFile') {
      sendJson(res, 200, await fsService.readFileBase64(url.searchParams.get('path') ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/writeFile') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.writeFileBase64(body.path, body.base64 ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/copy') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.copyPath(body.from, body.to));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/move') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await fsService.movePath(body.from, body.to));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/stat') {
      sendJson(res, 200, await fsService.statPath(url.searchParams.get('path') ?? ''));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/download') {
      const relativePath = url.searchParams.get('path') ?? '';
      const buffer = await fsService.readFileBuffer(relativePath);
      const fileName = path.basename(relativePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
      res.end(buffer);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/open') {
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        await openWorkspace(body.relativePath, getDataRoot(), getTempPath()),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/workspace/read') {
      sendJson(res, 200, await readWorkspaceFile(url.searchParams.get('sessionId') ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/write') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await writeWorkspaceFile(body.sessionId, body.base64 ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/commit') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await commitWorkspace(body.sessionId, getDataRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/rename') {
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        await renameWorkspace(body.sessionId, body.relativePath, getDataRoot()),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/close') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await closeWorkspace(body.sessionId));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/editors/status') {
      sendJson(res, 200, await getEditorCoresStatus(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/editors/update') {
      sendJson(res, 200, await updateEditorCores(getPortableRoot()));
      return true;
    }

    sendJson(res, 404, { error: 'API route not found.' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    sendJson(res, 500, { error: message });
    return true;
  }
}
