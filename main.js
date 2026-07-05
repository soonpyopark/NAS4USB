import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME } from './shared/constants.js';
import { resolveAppIconPath } from './electron/appIcon.js';
import {
  ensureDataRoot,
  getAppPaths,
  getDataRoot,
  getPortableRoot,
  getSyncInfo,
  getTempPath,
  initAppContext,
  resolvePortablePath,
} from './electron/appContext.js';
import * as fsService from './electron/fsService.js';
import { startDevServer, stopDevServer } from './electron/devServer.js';
import {
  configureSyncServer,
  startSyncServer,
  stopSyncServer,
  getSyncPort,
  getLocalIPv4Addresses,
} from './electron/syncServer.js';
import { resolveServerEnv, resolveDataRoot, isDefaultDataRoot } from './electron/envConfig.js';
import { resolvePortableRoot } from './electron/portablePaths.js';
import {
  closeWorkspace,
  commitWorkspace,
  cleanupAllSessions,
  getSession,
  renameWorkspace,
  openWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
} from './electron/tempWorkspace.js';
import { getEditorCoresStatus, updateEditorCores } from './electron/editorUpdater.js';
import { loginAdmin } from './electron/authService.js';
import {
  createShareLink,
  getShareMap,
  resolveShareToken,
  revokeShareLink,
  syncSharePathDelete,
  syncSharePathRename,
} from './electron/shareLinkService.js';
import {
  getFileAccessMap,
  setFileAccess,
  syncFileAccessDelete,
  syncFileAccessRename,
} from './electron/fileAccessService.js';
import {
  deletePermanent,
  emptyTrash,
  getTrashMap,
  restorePath,
  trashPath,
} from './electron/trashService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/** @type {{ port: number, addresses: string[], appUrl?: string } | null} */
let activeServerInfo = null;

let mainWindow = null;

function createMainWindow() {
  const iconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  const appUrl =
    activeServerInfo?.appUrl ?? `http://127.0.0.1:${activeServerInfo?.port ?? getSyncPort()}`;

  mainWindow.loadURL(appUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function ensureServer() {
  if (activeServerInfo) return activeServerInfo;

  if (isDev) {
    activeServerInfo = await startDevServer();
  } else {
    activeServerInfo = startSyncServer(path.join(__dirname, 'dist'));
  }

  return activeServerInfo;
}

async function shutdownServer() {
  if (isDev) {
    await stopDevServer();
  } else {
    stopSyncServer();
  }
  activeServerInfo = null;
}

ipcMain.handle('app:getPaths', () => getAppPaths());

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid external URL');
  }
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('sync:getInfo', async () => {
  await ensureServer();
  return getSyncInfo();
});

ipcMain.handle('fs:readDir', async (_event, relativePath = '.') => fsService.readDir(relativePath));

ipcMain.handle('fs:mkdir', async (_event, relativePath) => fsService.mkdir(relativePath));

ipcMain.handle('fs:rename', async (_event, fromRelative, toRelative) => {
  await syncSharePathRename(fromRelative, toRelative, getPortableRoot());
  await syncFileAccessRename(fromRelative, toRelative, getPortableRoot());
  return fsService.renamePath(fromRelative, toRelative);
});

ipcMain.handle('fs:delete', async (_event, relativePath) => {
  await syncSharePathDelete(relativePath, getPortableRoot());
  await syncFileAccessDelete(relativePath, getPortableRoot());
  return fsService.deletePath(relativePath);
});

ipcMain.handle('fs:openPath', async (_event, relativePath) => {
  const error = await shell.openPath(resolvePortablePath(relativePath));
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle('fs:exists', async (_event, relativePath) => fsService.pathExists(relativePath));

ipcMain.handle('fs:readFile', async (_event, relativePath) => fsService.readFileBase64(relativePath));

ipcMain.handle('fs:writeFile', async (_event, relativePath, base64 = '') =>
  fsService.writeFileBase64(relativePath, base64),
);

ipcMain.handle('fs:copy', async (_event, fromRelative, toRelative) =>
  fsService.copyPath(fromRelative, toRelative),
);

ipcMain.handle('fs:move', async (_event, fromRelative, toRelative) => {
  await syncSharePathRename(fromRelative, toRelative, getPortableRoot());
  await syncFileAccessRename(fromRelative, toRelative, getPortableRoot());
  return fsService.movePath(fromRelative, toRelative);
});

ipcMain.handle('fs:stat', async (_event, relativePath) => fsService.statPath(relativePath));

ipcMain.handle('workspace:open', async (_event, relativePath) =>
  openWorkspace(relativePath, getDataRoot(), getTempPath()),
);

ipcMain.handle('workspace:read', async (_event, sessionId) => readWorkspaceFile(sessionId));

ipcMain.handle('workspace:write', async (_event, sessionId, base64) => writeWorkspaceFile(sessionId, base64));

ipcMain.handle('workspace:commit', async (_event, sessionId) => commitWorkspace(sessionId, getDataRoot()));

ipcMain.handle('workspace:rename', async (_event, sessionId, newRelativePath) => {
  const fromPath = getSession(sessionId).relativePath;
  const result = await renameWorkspace(sessionId, newRelativePath, getDataRoot());
  await syncSharePathRename(fromPath, result.relativePath, getPortableRoot());
  await syncFileAccessRename(fromPath, result.relativePath, getPortableRoot());
  return result;
});

ipcMain.handle('workspace:close', async (_event, sessionId) => closeWorkspace(sessionId));

ipcMain.handle('editors:getStatus', async () => getEditorCoresStatus(getPortableRoot()));

ipcMain.handle('editors:update', async () => updateEditorCores(getPortableRoot()));

ipcMain.handle('auth:login', async (_event, { id, password } = {}) =>
  loginAdmin(id, password, getPortableRoot()),
);

ipcMain.handle('share:getMap', async () => getShareMap(getPortableRoot()));

ipcMain.handle('share:create', async (_event, { path: relativePath } = {}) =>
  createShareLink(relativePath, getPortableRoot()),
);

ipcMain.handle('share:revoke', async (_event, { path: relativePath } = {}) =>
  revokeShareLink(relativePath, getPortableRoot()),
);

ipcMain.handle('share:resolve', async (_event, { token } = {}) =>
  resolveShareToken(token, getPortableRoot()),
);

ipcMain.handle('fileAccess:getMap', async () => getFileAccessMap(getPortableRoot()));

ipcMain.handle('fileAccess:set', async (_event, { path: relativePath, visibility, viewRestricted } = {}) =>
  setFileAccess(relativePath, { visibility, viewRestricted }, getPortableRoot()),
);

ipcMain.handle('trash:getMap', async () => getTrashMap(getPortableRoot()));

ipcMain.handle('trash:move', async (_event, { path: relativePath } = {}) =>
  trashPath(relativePath, getPortableRoot()),
);

ipcMain.handle('trash:restore', async (_event, { path: relativePath } = {}) =>
  restorePath(relativePath, getPortableRoot()),
);

ipcMain.handle('trash:empty', async () => emptyTrash(getPortableRoot()));

ipcMain.handle('trash:deletePermanent', async (_event, { path: relativePath } = {}) =>
  deletePermanent(relativePath, getPortableRoot()),
);

function focusMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    const portableRoot = resolvePortableRoot(isDev);
    const serverEnv = resolveServerEnv(portableRoot, isDev);
    const dataRoot = resolveDataRoot(portableRoot);
    configureSyncServer(serverEnv);

    initAppContext({
      portableRoot,
      dataRoot,
      tempPath: app.getPath('temp'),
      isDev,
      getServerInfo: () => ({
        port: activeServerInfo?.port ?? getSyncPort(),
        addresses: activeServerInfo?.addresses ?? getLocalIPv4Addresses(),
      }),
    });

    await ensureDataRoot({ seedDefaultDepartment: isDefaultDataRoot(dataRoot, portableRoot) });

    try {
      await ensureServer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[dev] Server startup failed: ${message}`);
      if (err instanceof Error && 'code' in err && err.code === 'EADDRINUSE') {
        console.error(
          `[dev] Port ${getSyncPort()} is already in use. Stop the existing server with "npm run dev:stop" or wait a few seconds and retry.`,
        );
      }
      app.quit();
      return;
    }

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (isDev) {
    console.log(
      '[dev] Window closed — sync server keeps running. Run "npm run dev" again to reopen the UI, or "npm run dev:stop" to shut down.',
    );
    return;
  }
  if (process.platform !== 'darwin') {
    shutdownServer();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await shutdownServer();
  await cleanupAllSessions(getTempPath());
});
