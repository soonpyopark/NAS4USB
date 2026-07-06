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
  getSession,
  renameWorkspace,
  openWorkspace,
  readWorkspaceFile,
  saveWorkspace,
  writeWorkspaceFile,
} from './tempWorkspace.js';
import { getEditorCoresStatus, updateEditorCores } from './editorUpdater.js';
import { loginAdmin, isValidAdminSession, revokeAdminSession } from './authService.js';
import {
  assertAdminAuthenticated,
  assertCanAccessFile,
  assertCanEditFile,
  pathExistsWithAccessFilter,
  readDirWithAccessFilter,
  readFileBase64WithAccessFilter,
  statPathWithAccessFilter,
} from './fileAccessGuard.js';
import { filterFileAccessMap } from '../shared/fileAccessVisibility.js';
import {
  createShareLink,
  getShareMap,
  resolveShareToken,
  revokeShareLink,
  syncSharePathDelete,
  syncSharePathRename,
} from './shareLinkService.js';
import {
  getFileAccessMap,
  setFileAccess,
  syncFileAccessDelete,
  syncFileAccessRename,
} from './fileAccessService.js';
import {
  deletePermanent,
  emptyTrash,
  getTrashMap,
  restorePath,
  trashPath,
} from './trashService.js';
import { streamFile } from './mediaStream.js';
import { getAudioMimeType, getVideoMimeType, isAudioExtension, isVideoExtension } from '../shared/mediaTypes.js';
import { handleFsEventsRequest, notifyFsChanged, getFsRevisionPayload } from './fsNotifyService.js';

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
 */
function getAdminToken(req) {
  const header = req.headers['x-admin-token'];
  return typeof header === 'string' ? header.trim() : '';
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function isAdminAuthenticated(req) {
  return isValidAdminSession(getAdminToken(req));
}

/**
 * @param {URL} url
 */
function getShareTokenFromQuery(url) {
  return url.searchParams.get('share')?.trim() || undefined;
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

    if (url.pathname === '/api/fs/events') {
      handleFsEventsRequest(req, res);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/revision') {
      sendJson(res, 200, getFsRevisionPayload());
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readDir') {
      sendJson(
        res,
        200,
        await readDirWithAccessFilter(
          url.searchParams.get('path') ?? '.',
          isAdminAuthenticated(req),
          getPortableRoot(),
        ),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/mkdir') {
      const body = await readJsonBody(req);
      const result = await fsService.mkdir(body.path);
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/delete') {
      const body = await readJsonBody(req);
      await syncSharePathDelete(body.path, getPortableRoot());
      await syncFileAccessDelete(body.path, getPortableRoot());
      const result = await fsService.deletePath(body.path);
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/rename') {
      const body = await readJsonBody(req);
      await syncSharePathRename(body.from, body.to, getPortableRoot());
      await syncFileAccessRename(body.from, body.to, getPortableRoot());
      const result = await fsService.renamePath(body.from, body.to);
      notifyFsChanged([body.from, body.to]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/exists') {
      sendJson(
        res,
        200,
        await pathExistsWithAccessFilter(
          url.searchParams.get('path') ?? '',
          isAdminAuthenticated(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readFile') {
      sendJson(
        res,
        200,
        await readFileBase64WithAccessFilter(
          url.searchParams.get('path') ?? '',
          isAdminAuthenticated(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/writeFile') {
      const body = await readJsonBody(req);
      const result = await fsService.writeFileBase64(body.path, body.base64 ?? '');
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/copy') {
      const body = await readJsonBody(req);
      const result = await fsService.copyPath(body.from, body.to);
      notifyFsChanged([body.from, body.to]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/move') {
      const body = await readJsonBody(req);
      await syncSharePathRename(body.from, body.to, getPortableRoot());
      await syncFileAccessRename(body.from, body.to, getPortableRoot());
      const result = await fsService.movePath(body.from, body.to);
      notifyFsChanged([body.from, body.to]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/stat') {
      sendJson(
        res,
        200,
        await statPathWithAccessFilter(
          url.searchParams.get('path') ?? '',
          isAdminAuthenticated(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/download') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, isAdminAuthenticated(req), getShareTokenFromQuery(url));
      const buffer = await fsService.readFileBuffer(relativePath);
      const fileName = path.basename(relativePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
      res.end(buffer);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/stream') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, isAdminAuthenticated(req), getShareTokenFromQuery(url));
      const extension = path.extname(relativePath).slice(1).toLowerCase();
      const contentType = isVideoExtension(extension)
        ? getVideoMimeType(extension)
        : isAudioExtension(extension)
          ? getAudioMimeType(extension)
          : 'application/octet-stream';
      await streamFile(req, res, relativePath, contentType);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/open') {
      const body = await readJsonBody(req);
      const shareToken = body.shareToken || getShareTokenFromQuery(url);
      await assertCanAccessFile(body.relativePath, isAdminAuthenticated(req), shareToken);
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
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(
        session.relativePath,
        isAdminAuthenticated(req),
        getShareTokenFromQuery(url),
      );
      sendJson(res, 200, await writeWorkspaceFile(body.sessionId, body.base64 ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/commit') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(
        session.relativePath,
        isAdminAuthenticated(req),
        getShareTokenFromQuery(url),
      );
      const result = await commitWorkspace(body.sessionId, getDataRoot());
      notifyFsChanged(session.relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/save') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(
        session.relativePath,
        isAdminAuthenticated(req),
        getShareTokenFromQuery(url),
      );
      const result = await saveWorkspace(body.sessionId, body.base64 ?? '', getDataRoot());
      notifyFsChanged(session.relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/rename') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(
        session.relativePath,
        isAdminAuthenticated(req),
        getShareTokenFromQuery(url),
      );
      const fromPath = session.relativePath;
      const result = await renameWorkspace(body.sessionId, body.relativePath, getDataRoot());
      await syncSharePathRename(fromPath, result.relativePath, getPortableRoot());
      await syncFileAccessRename(fromPath, result.relativePath, getPortableRoot());
      notifyFsChanged([fromPath, result.relativePath]);
      sendJson(res, 200, result);
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

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      sendJson(res, 200, loginAdmin(body.id, body.password, getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/auth/logout') {
      revokeAdminSession(getAdminToken(req));
      sendJson(res, 200, { success: true });
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/share/map') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      sendJson(res, 200, await getShareMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/share/create') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await createShareLink(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/share/revoke') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await revokeShareLink(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/share/resolve') {
      sendJson(res, 200, await resolveShareToken(url.searchParams.get('token') ?? '', getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/file-access/map') {
      const accessMap = await getFileAccessMap(getPortableRoot());
      sendJson(res, 200, filterFileAccessMap(accessMap, isAdminAuthenticated(req)));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/file-access/can-edit') {
      const relativePath = url.searchParams.get('path') ?? '';
      try {
        await assertCanEditFile(relativePath, isAdminAuthenticated(req), getShareTokenFromQuery(url));
        sendJson(res, 200, { canEdit: true });
      } catch (error) {
        sendJson(res, 200, {
          canEdit: false,
          message: error instanceof Error ? error.message : '공개된 문서만 편집할 수 있습니다.',
        });
      }
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/file-access/set') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await setFileAccess(
        body.path,
        { visibility: body.visibility, viewRestricted: body.viewRestricted },
        getPortableRoot(),
      );
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/trash/map') {
      sendJson(res, 200, await getTrashMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/move') {
      const body = await readJsonBody(req);
      const result = await trashPath(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/restore') {
      const body = await readJsonBody(req);
      const result = await restorePath(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/empty') {
      const result = await emptyTrash(getPortableRoot());
      notifyFsChanged();
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/deletePermanent') {
      const body = await readJsonBody(req);
      const result = await deletePermanent(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
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
