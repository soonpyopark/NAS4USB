import path from 'node:path';
import { FAVORITES_FOLDER } from '../shared/constants.js';
import {
  getAppPaths,
  getDataRoot,
  getPortableRoot,
  getExeRoot,
  getInstallRoot,
  getSyncInfo,
  getTempPath,
  setExternalFolders,
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
import { getEditorCoresStatus } from './editorUpdater.js';
import {
  loginAdmin,
  isValidAdminSession,
  revokeAdminSession,
  getAdminSession,
  isSuperAdminSession,
  isDefaultAdminPasswordActive,
} from './authService.js';
import {
  assertAdminAuthenticated,
  assertSuperAdminAuthenticated,
  assertCanAccessFile,
  assertCanAccessTrash,
  assertCanEditFile,
  assertCanChangeFolderOrder,
  assertGuestCanWrite,
  assertHomeSystemPathMutable,
  filterTrashMapByHomeAccess,
  filterFavoritesMapForAuth,
  filterFavoriteEntriesForAuth,
  pathExistsWithAccessFilter,
  readDirWithAccessFilter,
  readFileBase64WithAccessFilter,
  resolveHomeScopedWritePath,
  statPathWithAccessFilter,
  assertCanClearFileHistoryTree,
} from './fileAccessGuard.js';
import { filterFileAccessMap, canViewFileEntry } from '../shared/fileAccessVisibility.js';
import {
  createShareLink,
  getShareMap,
  resolveShareToken,
  revokeShareLink,
  setShareLink,
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
  getFavoritesMap,
  listFavoriteEntries,
  setFavorite,
  setFavoriteOrder,
  syncFavoritesDelete,
  syncFavoritesRename,
} from './favoritesService.js';
import {
  assignRandomFolderColor,
  getFolderColorsMap,
  getEntryBoldMap,
  setFolderColor,
  setEntryBold,
  getEntryLevelMap,
  setEntryLevel,
  setEntryLevels,
  getEntryCollapsedMap,
  setEntryCollapsed,
  setEntryCollapsedMany,
  syncFolderColorsDelete,
  syncFolderColorsMoveTree,
} from './folderColorsService.js';
import {
  getFolderOrderMap,
  setFolderOrder,
  syncFolderOrderDelete,
  syncFolderOrderMoveTree,
} from './folderOrderService.js';
import {
  deletePermanent,
  emptyTrash,
  getTrashMap,
  restorePath,
  trashPath,
} from './trashService.js';
import { getAppSettings, getAccessPermissionsBundle, getEffectiveAccessPermissions, getPublicUiPrefs, updateAppSettings } from './settingsService.js';
import { setSessionSpellCheckerEnabled } from './spellcheckSession.js';
import { listMembers, saveMembersPayload, getMembersExportRecords } from './membersService.js';
import {
  syncFortuneSidecarCopy,
  syncFortuneSidecarDelete,
  syncFortuneSidecarRename,
  isFortuneSidecarRelativePath,
} from './fortuneSidecarService.js';
import {
  syncPdfViewerSidecarCopy,
  syncPdfViewerSidecarDelete,
  syncPdfViewerSidecarRename,
  isPdfViewerSidecarRelativePath,
} from './pdfViewerSidecarService.js';
import { syncTiptapAssetRename } from './tiptapAssetService.js';
import { streamAbsoluteFile, streamFile, streamHlsAsset, rewriteHlsPlaylist } from './mediaStream.js';
import {
  ensureVideoPreview,
  getFfmpegStatus,
  getVideoPreviewStatus,
  pruneVideoPreviewCache,
  resolveVideoPreviewHlsFile,
} from './ffmpegPreviewService.js';
import {
  closeComicArchive,
  getComicArchivePage,
  openComicArchive,
} from './comicArchive.js';
import { getStreamContentType } from '../shared/mediaTypes.js';
import { handleFsEventsRequest, notifyFsChanged, getFsRevisionPayload } from './fsNotifyService.js';
import {
  getPersonalDocIndexStatus,
  searchPersonalDocIndex,
  startPersonalDocIndex,
  stopPersonalDocIndex,
} from './personalDocIndexService.js';
import {
  abortUpload,
  commitUpload,
  initUpload,
  writeUploadPart,
} from './uploadSessionService.js';
import { MAX_UPLOAD_PART_BYTES, UPLOAD_PART_TIMEOUT_MS } from '../shared/chunkedUpload.js';
import {
  clearFileHistoryUnder,
  deleteFileHistoryEntry,
  listFileHistory,
  readFileHistoryBase64,
  readFileHistorySidecarSheets,
  restoreFileHistoryEntry,
  syncFileHistoryDelete,
  syncFileHistoryRename,
} from './fileHistoryService.js';

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
 * @param {number} maxBytes
 */
async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      req.destroy();
      const error = new Error('업로드 조각이 너무 큽니다.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function getAdminToken(req) {
  const header = req.headers['x-admin-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  // <img>/<video>/<audio> tags issue plain GETs that can't set custom headers, so also
  // accept the admin token as a `token` query param (used by /api/fs/stream, etc.).
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken?.trim()) return queryToken.trim();
  } catch {
    // ignore malformed URL
  }

  return '';
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function getAccessAuth(req) {
  const session = getAdminSession(getAdminToken(req));
  return {
    isLoggedIn: Boolean(session),
    loginId: session?.adminId ?? null,
    role: session?.role === 'super_admin' ? 'super_admin' : session ? 'member' : null,
  };
}

function isAdminAuthenticated(req) {
  return getAccessAuth(req).isLoggedIn;
}

function isSuperAdminAuthenticated(req) {
  return isSuperAdminSession(getAdminToken(req));
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
      sendJson(res, 200, getAppPaths(getAccessAuth(req)));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/app/checkForUpdates') {
      const { fetchLatestRelease } = await import('./updateCheck.js');
      sendJson(res, 200, await fetchLatestRelease());
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

    if (method === 'GET' && url.pathname === '/api/docIndex/status') {
      sendJson(res, 200, await getPersonalDocIndexStatus(getAccessAuth(req)));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/docIndex/search') {
      sendJson(
        res,
        200,
        await searchPersonalDocIndex(getAccessAuth(req), url.searchParams.get('q') ?? ''),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/docIndex/start') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await startPersonalDocIndex(getAccessAuth(req), { reset: Boolean(body.reset) }));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/docIndex/stop') {
      sendJson(res, 200, await stopPersonalDocIndex(getAccessAuth(req)));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readDir') {
      sendJson(
        res,
        200,
        await readDirWithAccessFilter(url.searchParams.get('path') ?? '.', getAccessAuth(req),
          getPortableRoot(),
        ),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/mkdir') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const target = resolveHomeScopedWritePath(body.path ?? '', auth);
      await assertCanEditFile(target, auth, getShareTokenFromQuery(url));
      const result = await fsService.mkdir(target);
      try {
        await assignRandomFolderColor(target, getPortableRoot());
      } catch {
        // folder creation must still succeed if color assignment fails
      }
      notifyFsChanged(target);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/delete') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      if (isFortuneSidecarRelativePath(body.path)) {
        sendJson(res, 400, { error: 'FortuneSheet 편집용 보조 파일입니다. 연결된 스프레드시트를 삭제해 주세요.' });
        return true;
      }
      if (isPdfViewerSidecarRelativePath(body.path)) {
        sendJson(res, 400, { error: 'PDF 뷰어 보조 파일입니다. 연결된 PDF를 삭제해 주세요.' });
        return true;
      }
      await syncSharePathDelete(body.path, getPortableRoot());
      await syncFileAccessDelete(body.path, getPortableRoot());
      await syncFavoritesDelete(body.path, getPortableRoot());
      await syncFolderColorsDelete(body.path, getPortableRoot());
      await syncFolderOrderDelete(body.path, getPortableRoot());
      await syncFortuneSidecarDelete(body.path);
      await syncPdfViewerSidecarDelete(body.path);
      await syncFileHistoryDelete(body.path, getPortableRoot());
      const result = await fsService.deletePath(body.path);
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/rename') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.from, 'rename-source');
      assertHomeSystemPathMutable(body.to, 'mutate');
      await assertCanEditFile(body.from ?? '', auth, shareToken);
      await assertCanEditFile(body.to ?? '', auth, shareToken);
      await syncSharePathRename(body.from, body.to, getPortableRoot());
      await syncFileAccessRename(body.from, body.to, getPortableRoot());
      await syncFavoritesRename(body.from, body.to, getPortableRoot());
      await syncFolderColorsMoveTree(body.from, body.to, getPortableRoot());
      await syncFolderOrderMoveTree(body.from, body.to, getPortableRoot());
      await syncFortuneSidecarRename(body.from, body.to);
      await syncPdfViewerSidecarRename(body.from, body.to);
      await syncTiptapAssetRename(body.from, body.to);
      await syncFileHistoryRename(body.from, body.to, getPortableRoot());
      const result = await fsService.renamePath(body.from, body.to);
      notifyFsChanged([body.from, body.to]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/exists') {
      sendJson(
        res,
        200,
        await pathExistsWithAccessFilter(url.searchParams.get('path') ?? '', getAccessAuth(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/readFile') {
      sendJson(
        res,
        200,
        await readFileBase64WithAccessFilter(url.searchParams.get('path') ?? '', getAccessAuth(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/writeFile') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const target = resolveHomeScopedWritePath(body.path ?? '', auth);
      await assertCanEditFile(target, auth, getShareTokenFromQuery(url));
      const result = await fsService.writeFileBase64(target, body.base64 ?? '');
      notifyFsChanged(target);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/upload/init') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const target = resolveHomeScopedWritePath(body.path ?? '', auth);
      await assertCanEditFile(target, auth, getShareTokenFromQuery(url));
      sendJson(res, 200, await initUpload({ relativePath: target, size: body.size }));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/upload/part') {
      req.setTimeout(UPLOAD_PART_TIMEOUT_MS + 15_000);
      const uploadId = url.searchParams.get('id') ?? '';
      const offset = Number(url.searchParams.get('offset') ?? '0');
      const buffer = await readRawBody(req, MAX_UPLOAD_PART_BYTES);
      sendJson(res, 200, await writeUploadPart(uploadId, offset, buffer));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/upload/commit') {
      const body = await readJsonBody(req);
      const result = await commitUpload(body.uploadId ?? '');
      notifyFsChanged(result.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/upload/abort') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await abortUpload(body.uploadId ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/copy') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      const dest = resolveHomeScopedWritePath(body.to ?? '', auth);
      assertHomeSystemPathMutable(dest, 'mutate');
      await assertCanAccessFile(body.from ?? '', auth, shareToken);
      await assertCanEditFile(dest, auth, shareToken);
      const result = await fsService.copyPath(body.from, dest);
      await syncFortuneSidecarCopy(body.from, dest);
      await syncPdfViewerSidecarCopy(body.from, dest);
      notifyFsChanged([body.from, dest]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/fs/move') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      const dest = resolveHomeScopedWritePath(body.to ?? '', auth);
      assertHomeSystemPathMutable(body.from, 'rename-source');
      assertHomeSystemPathMutable(dest, 'mutate');
      await assertCanEditFile(body.from ?? '', auth, shareToken);
      await assertCanEditFile(dest, auth, shareToken);
      await syncSharePathRename(body.from, dest, getPortableRoot());
      await syncFileAccessRename(body.from, dest, getPortableRoot());
      await syncFavoritesRename(body.from, dest, getPortableRoot());
      await syncFolderColorsMoveTree(body.from, dest, getPortableRoot());
      await syncFolderOrderMoveTree(body.from, dest, getPortableRoot());
      await syncFortuneSidecarRename(body.from, dest);
      await syncPdfViewerSidecarRename(body.from, dest);
      await syncTiptapAssetRename(body.from, dest);
      await syncFileHistoryRename(body.from, dest, getPortableRoot());
      const result = await fsService.movePath(body.from, dest);
      notifyFsChanged([body.from, dest]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/stat') {
      sendJson(
        res,
        200,
        await statPathWithAccessFilter(url.searchParams.get('path') ?? '', getAccessAuth(req),
          getShareTokenFromQuery(url),
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/fs/download') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
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
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      const extension = path.extname(relativePath).slice(1).toLowerCase();
      await streamFile(req, res, relativePath, getStreamContentType(extension));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/media/ffmpegStatus') {
      sendJson(res, 200, await getFfmpegStatus(getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/media/videoPreview') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      const force = url.searchParams.get('force') === '1';
      const prepare = url.searchParams.get('prepare') === '1';
      const waitForFull = url.searchParams.get('full') === '1';
      const hlsName = url.searchParams.get('hls');
      try {
        if (hlsName) {
          const hlsStart = Number(url.searchParams.get('start'));
          void ensureVideoPreview(relativePath, getPortableRoot(), {
            waitMs: 0,
            startSeconds: Number.isFinite(hlsStart) ? hlsStart : 0,
            replace: false,
          }).catch(() => {});
          const asset = await resolveVideoPreviewHlsFile(relativePath, hlsName);
          await streamHlsAsset(req, res, asset.absolutePath, asset.contentType, {
            rewritePlaylist:
              hlsName === 'index.m3u8' ? (text) => rewriteHlsPlaylist(text, url) : undefined,
          });
          return true;
        }

        if (prepare && url.searchParams.get('status') === '1') {
          sendJson(res, 200, await getVideoPreviewStatus(relativePath));
          return true;
        }

        const startSeconds = Number(url.searchParams.get('start'));
        const preview = await ensureVideoPreview(relativePath, getPortableRoot(), {
          force,
          waitForFull,
          startSeconds: Number.isFinite(startSeconds) ? startSeconds : 0,
          replace: url.searchParams.get('replace') === '1',
        });
        if (prepare) {
          sendJson(res, 200, {
            ok: true,
            remuxed: preview.remuxed,
            reason: preview.reason,
            stage: preview.stage,
            fullReady: Boolean(preview.fullReady),
            protocol: preview.protocol || 'native',
            durationSeconds: preview.durationSeconds ?? null,
            startSeconds: preview.startSeconds ?? 0,
            availableSeconds: preview.availableSeconds ?? null,
          });
          return true;
        }
        res.setHeader('X-Nas4usb-Video-Preview', preview.remuxed ? 'remuxed' : 'source');
        res.setHeader('X-Nas4usb-Video-Preview-Reason', preview.reason);
        res.setHeader('X-Nas4usb-Video-Preview-Stage', preview.stage);
        res.setHeader('Cache-Control', 'no-store');
        if (preview.protocol === 'hls') {
          const asset = await resolveVideoPreviewHlsFile(relativePath, 'index.m3u8');
          await streamHlsAsset(req, res, asset.absolutePath, asset.contentType, {
            rewritePlaylist: (text) => rewriteHlsPlaylist(text, url),
          });
        } else {
          await streamAbsoluteFile(req, res, preview.absolutePath, preview.contentType);
        }
      } catch (error) {
        const status = Number(error?.statusCode) || 500;
        sendJson(res, status, {
          error: error instanceof Error ? error.message : '영상 호환 변환에 실패했습니다.',
        });
      }
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/comic/openArchive') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      try {
        sendJson(res, 200, await openComicArchive(relativePath));
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : '압축 파일을 열지 못했습니다.',
        });
      }
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/comic/archivePage') {
      const sessionId = url.searchParams.get('sessionId') ?? '';
      const index = Number.parseInt(url.searchParams.get('index') ?? '', 10);
      try {
        const page = getComicArchivePage(sessionId, index);
        await streamAbsoluteFile(req, res, page.absolutePath, page.mimeType);
      } catch (error) {
        sendJson(res, 404, {
          error: error instanceof Error ? error.message : '페이지를 찾을 수 없습니다.',
        });
      }
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/comic/closeArchive') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await closeComicArchive(body.sessionId ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/open') {
      const body = await readJsonBody(req);
      const shareToken = body.shareToken || getShareTokenFromQuery(url);
      await assertCanAccessFile(body.relativePath, getAccessAuth(req), shareToken);
      sendJson(
        res,
        200,
        await openWorkspace(body.relativePath, getDataRoot(), getTempPath(), { shareToken }),
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
      await assertCanEditFile(session.relativePath, getAccessAuth(req),
        session.shareToken || getShareTokenFromQuery(url),
      );
      sendJson(res, 200, await writeWorkspaceFile(body.sessionId, body.base64 ?? ''));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/commit') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(session.relativePath, getAccessAuth(req),
        session.shareToken || getShareTokenFromQuery(url),
      );
      const result = await commitWorkspace(body.sessionId, getDataRoot());
      notifyFsChanged(session.relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/save') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(session.relativePath, getAccessAuth(req),
        session.shareToken || getShareTokenFromQuery(url),
      );
      const result = await saveWorkspace(body.sessionId, body.base64 ?? '', getDataRoot());
      notifyFsChanged(session.relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/rename') {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId ?? '');
      await assertCanEditFile(session.relativePath, getAccessAuth(req),
        session.shareToken || getShareTokenFromQuery(url),
      );
      const fromPath = session.relativePath;
      const result = await renameWorkspace(body.sessionId, body.relativePath, getDataRoot());
      await syncSharePathRename(fromPath, result.relativePath, getPortableRoot());
      await syncFileAccessRename(fromPath, result.relativePath, getPortableRoot());
      await syncFavoritesRename(fromPath, result.relativePath, getPortableRoot());
      await syncFolderColorsMoveTree(fromPath, result.relativePath, getPortableRoot());
      await syncFolderOrderMoveTree(fromPath, result.relativePath, getPortableRoot());
      await syncFortuneSidecarRename(fromPath, result.relativePath);
      await syncPdfViewerSidecarRename(fromPath, result.relativePath);
      await syncTiptapAssetRename(fromPath, result.relativePath);
      await syncFileHistoryRename(fromPath, result.relativePath, getPortableRoot());
      notifyFsChanged([fromPath, result.relativePath]);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/workspace/close') {
      const body = await readJsonBody(req);
      const result = await closeWorkspace(body.sessionId);
      if (result.persisted && result.relativePath) notifyFsChanged(result.relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/editors/status') {
      sendJson(res, 200, await getEditorCoresStatus(getExeRoot(), getInstallRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/favorites/map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      if (perms.write) {
        sendJson(res, 200, filterFavoritesMapForAuth(await getFavoritesMap(getPortableRoot()), auth));
        return true;
      }
      const map = await getFavoritesMap(getPortableRoot());
      const accessMap = await getFileAccessMap(getPortableRoot());
      sendJson(
        res,
        200,
        filterFavoritesMapForAuth(
          Object.fromEntries(
            Object.entries(map).filter(([path]) => canViewFileEntry(path, accessMap, false)),
          ),
          auth,
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/favorites/listEntries') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, []);
        return true;
      }
      if (perms.write) {
        sendJson(
          res,
          200,
          filterFavoriteEntriesForAuth(await listFavoriteEntries(getPortableRoot()), auth),
        );
        return true;
      }
      const entries = await listFavoriteEntries(getPortableRoot());
      const accessMap = await getFileAccessMap(getPortableRoot());
      sendJson(
        res,
        200,
        filterFavoriteEntriesForAuth(
          entries.filter((entry) => canViewFileEntry(entry.relativePath, accessMap, false)),
          auth,
        ),
      );
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/favorites/set') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await setFavorite(body.path, Boolean(body.favorited), getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/favorites/setOrder') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await setFavoriteOrder(body.kind, body.paths, getPortableRoot());
      notifyFsChanged(FAVORITES_FOLDER);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/folder-colors/map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      sendJson(res, 200, await getFolderColorsMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      const result = await setFolderColor(body.path, body.color, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/folder-colors/bold-map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      sendJson(res, 200, await getEntryBoldMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set-bold') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      const result = await setEntryBold(body.path, Boolean(body.bold), getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/folder-colors/level-map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      sendJson(res, 200, await getEntryLevelMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set-level') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      const result = await setEntryLevel(body.path, body.level, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set-levels') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      const list = Array.isArray(body.entries) ? body.entries : [];
      for (const item of list) {
        const relativePath = item?.path || item?.relativePath;
        assertHomeSystemPathMutable(relativePath, 'mutate');
        await assertCanEditFile(relativePath ?? '', auth, shareToken);
      }
      const result = await setEntryLevels(list, getPortableRoot());
      if (result.entries[0]?.relativePath) notifyFsChanged(result.entries[0].relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/folder-colors/collapsed-map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      sendJson(res, 200, await getEntryCollapsedMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set-collapsed') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      const result = await setEntryCollapsed(body.path, Boolean(body.collapsed), getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-colors/set-collapsed-many') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      const list = Array.isArray(body.entries) ? body.entries : [];
      for (const item of list) {
        const relativePath = item?.path || item?.relativePath;
        assertHomeSystemPathMutable(relativePath, 'mutate');
        await assertCanEditFile(relativePath ?? '', auth, shareToken);
      }
      const result = await setEntryCollapsedMany(list, getPortableRoot());
      if (result.entries[0]?.relativePath) notifyFsChanged(result.entries[0].relativePath);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/folder-order/map') {
      const auth = getAccessAuth(req);
      const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
      if (!perms.view && !perms.write) {
        sendJson(res, 200, {});
        return true;
      }
      sendJson(res, 200, await getFolderOrderMap(getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/folder-order/set') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      await assertCanChangeFolderOrder(body.path ?? '', auth);
      const result = await setFolderOrder(body.path, body.names, getPortableRoot(), auth.loginId);
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const proxied = Boolean(req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
      sendJson(
        res,
        200,
        await loginAdmin(body.id, body.password, getPortableRoot(), {
          remember: Boolean(body.rememberMe),
          clientIp: req.socket?.remoteAddress ?? '',
          proxied,
        }),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/auth/session') {
      const session = getAdminSession(getAdminToken(req));
      sendJson(res, 200, session ? { adminId: session.adminId, role: session.role ?? 'member' } : null);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/auth/showDefaultAdminHint') {
      sendJson(res, 200, {
        show: await isDefaultAdminPasswordActive(getPortableRoot()),
      });
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
      const result = await createShareLink(body.path, body.mode, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/share/set-mode') {
      assertAdminAuthenticated(isAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await setShareLink(body.path, body.mode ?? null, getPortableRoot());
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
      sendJson(
        res,
        200,
        filterFileAccessMap(
          accessMap,
          Boolean((await getEffectiveAccessPermissions(getAccessAuth(req), getPortableRoot())).write),
        ),
      );
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/file-access/can-edit') {
      const relativePath = url.searchParams.get('path') ?? '';
      try {
        await assertCanEditFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
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
      const auth = getAccessAuth(req);
      await assertCanAccessTrash(auth);
      sendJson(res, 200, filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/move') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const shareToken = getShareTokenFromQuery(url);
      assertHomeSystemPathMutable(body.path, 'mutate');
      await assertCanEditFile(body.path ?? '', auth, shareToken);
      const result = await trashPath(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/restore') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      await assertCanAccessTrash(auth);
      const map = filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth);
      const trashKey = String(body.path ?? '').replace(/\\/g, '/');
      if (!map[trashKey]) {
        sendJson(res, 400, { error: '휴지통 정보를 찾을 수 없습니다.' });
        return true;
      }
      await assertCanEditFile(map[trashKey].originalPath, auth, getShareTokenFromQuery(url));
      const result = await restorePath(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/empty') {
      await assertGuestCanWrite(getAccessAuth(req));
      const result = await emptyTrash(getPortableRoot());
      notifyFsChanged();
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/trash/deletePermanent') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      await assertCanAccessTrash(auth);
      const normalized = String(body.path ?? '').replace(/\\/g, '/');
      const map = filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth);
      if (normalized.startsWith('__trash/') && !map[normalized]) {
        sendJson(res, 400, { error: '휴지통 정보를 찾을 수 없습니다.' });
        return true;
      }
      assertHomeSystemPathMutable(body.path, 'mutate');
      if (!normalized.startsWith('__trash/')) {
        await assertCanEditFile(body.path ?? '', auth, getShareTokenFromQuery(url));
      }
      const result = await deletePermanent(body.path, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/history/list') {
      const relativePath = url.searchParams.get('path') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      sendJson(res, 200, await listFileHistory(relativePath, getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/history/read') {
      const relativePath = url.searchParams.get('path') ?? '';
      const entryId = url.searchParams.get('entryId') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      sendJson(res, 200, await readFileHistoryBase64(relativePath, entryId, getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/history/readSidecar') {
      const relativePath = url.searchParams.get('path') ?? '';
      const entryId = url.searchParams.get('entryId') ?? '';
      await assertCanAccessFile(relativePath, getAccessAuth(req), getShareTokenFromQuery(url));
      sendJson(res, 200, await readFileHistorySidecarSheets(relativePath, entryId, getPortableRoot()));
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/history/delete') {
      const body = await readJsonBody(req);
      await assertCanEditFile(body.path ?? '', getAccessAuth(req), getShareTokenFromQuery(url));
      const result = await deleteFileHistoryEntry(body.path, body.entryId, getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/history/restore') {
      const body = await readJsonBody(req);
      await assertCanEditFile(body.path ?? '', getAccessAuth(req), getShareTokenFromQuery(url));
      const result = await restoreFileHistoryEntry(body.path, body.entryId, getDataRoot(), getPortableRoot());
      notifyFsChanged(body.path);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/history/clearTree') {
      const body = await readJsonBody(req);
      const target = await assertCanClearFileHistoryTree(body.path ?? '', getAccessAuth(req));
      const result = await clearFileHistoryUnder(target, getPortableRoot());
      notifyFsChanged(target);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/settings') {
      assertSuperAdminAuthenticated(isSuperAdminAuthenticated(req));
      sendJson(res, 200, await getAppSettings(getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/settings/guest-permissions') {
      sendJson(res, 200, await getAccessPermissionsBundle(getPortableRoot(), getAccessAuth(req)));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/settings/theme') {
      sendJson(res, 200, await getPublicUiPrefs(getPortableRoot()));
      return true;
    }

    if (method === 'PUT' && url.pathname === '/api/settings') {
      assertSuperAdminAuthenticated(isSuperAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await updateAppSettings(body ?? {}, getPortableRoot());
      if (body && 'externalFolders' in body) {
        setExternalFolders(result.externalFolders);
      }
      if (body && 'spellcheckEnabled' in body) {
        setSessionSpellCheckerEnabled(result.spellcheckEnabled);
      }
      if (body && 'videoPreviewCacheMaxBytes' in body) {
        await pruneVideoPreviewCache(getPortableRoot()).catch(() => {});
      }
      notifyFsChanged();
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/members') {
      assertSuperAdminAuthenticated(isSuperAdminAuthenticated(req));
      sendJson(res, 200, await listMembers(getPortableRoot()));
      return true;
    }

    if (method === 'GET' && url.pathname === '/api/members/export') {
      assertSuperAdminAuthenticated(isSuperAdminAuthenticated(req));
      const settings = await getAppSettings(getPortableRoot());
      sendJson(res, 200, {
        members: await getMembersExportRecords(getPortableRoot()),
        guestPermissions: settings.guestPermissions,
      });
      return true;
    }

    if (method === 'PUT' && url.pathname === '/api/members') {
      assertSuperAdminAuthenticated(isSuperAdminAuthenticated(req));
      const body = await readJsonBody(req);
      const result = await saveMembersPayload(body ?? {}, getPortableRoot());
      if (result.ok) notifyFsChanged();
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/tiptap/importOnenote') {
      const body = await readJsonBody(req);
      const { convertOnenoteBase64 } = await import('./onenoteImportService.js');
      const result = await convertOnenoteBase64(body.base64 ?? '', body.fileName ?? 'section.one');
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/pdf/embedMarkups') {
      const body = await readJsonBody(req);
      const auth = getAccessAuth(req);
      const target = resolveHomeScopedWritePath(body.path ?? '', auth);
      await assertCanEditFile(target, auth, getShareTokenFromQuery(url));
      const { embedMarkupsIntoWorkspacePdf } = await import('./pdfMarkupEmbedService.js');
      const result = await embedMarkupsIntoWorkspacePdf(target, body.markups, body.remove);
      notifyFsChanged(target);
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/pdf/fromHtml') {
      // Host renders the export HTML with Chromium so LAN clients get the same PDF.
      const body = await readJsonBody(req);
      const { convertHtmlToPdfBase64 } = await import('./pdfExportService.js');
      const result = await convertHtmlToPdfBase64({
        html: body.html ?? '',
        fileName: body.fileName ?? 'document.pdf',
        pageSize: body.pageSize ?? 'A4',
        landscape: Boolean(body.landscape),
        marginMm: body.marginMm,
        preferCssPageSize: Boolean(body.preferCssPageSize),
        printBackground: body.printBackground,
      });
      sendJson(res, 200, result);
      return true;
    }

    if (method === 'POST' && url.pathname === '/api/tiptap/exportHwpx') {
      // Host converts TipTap/Markdown → HWPX via kordoc (no Python/Pandoc).
      const body = await readJsonBody(req);
      const { convertMarkdownToHwpxBase64 } = await import('./hwpxExportService.js');
      const result = await convertMarkdownToHwpxBase64({
        markdown: body.markdown ?? '',
        fileName: body.fileName ?? 'document.hwpx',
        assets: Array.isArray(body.assets) ? body.assets : [],
      });
      sendJson(res, 200, result);
      return true;
    }

    sendJson(res, 404, { error: 'API route not found.' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status =
      error && typeof error === 'object' && 'statusCode' in error && Number(error.statusCode)
        ? Number(error.statusCode)
        : 500;
    sendJson(res, status, { error: message });
    return true;
  }
}
