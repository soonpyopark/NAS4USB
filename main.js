import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SYNC_PORT } from './shared/constants.js';
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
import { startSyncServer, stopSyncServer, getSyncPort, getLocalIPv4Addresses } from './electron/syncServer.js';
import {
  openWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  commitWorkspace,
  renameWorkspace,
  closeWorkspace,
  cleanupAllSessions,
} from './electron/tempWorkspace.js';
import { getEditorCoresStatus, updateEditorCores } from './electron/editorUpdater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/** @type {{ port: number, addresses: string[], appUrl?: string } | null} */
let activeServerInfo = null;

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'EduCowork',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  if (isDev) {
    const appUrl = activeServerInfo?.appUrl ?? `http://127.0.0.1:${DEFAULT_SYNC_PORT}`;
    mainWindow.loadURL(appUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
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

ipcMain.handle('sync:getInfo', async () => {
  await ensureServer();
  return getSyncInfo();
});

ipcMain.handle('fs:readDir', async (_event, relativePath = '.') => fsService.readDir(relativePath));

ipcMain.handle('fs:mkdir', async (_event, relativePath) => fsService.mkdir(relativePath));

ipcMain.handle('fs:delete', async (_event, relativePath) => fsService.deletePath(relativePath));

ipcMain.handle('fs:rename', async (_event, fromRelative, toRelative) =>
  fsService.renamePath(fromRelative, toRelative),
);

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

ipcMain.handle('fs:move', async (_event, fromRelative, toRelative) =>
  fsService.movePath(fromRelative, toRelative),
);

ipcMain.handle('fs:stat', async (_event, relativePath) => fsService.statPath(relativePath));

ipcMain.handle('workspace:open', async (_event, relativePath) =>
  openWorkspace(relativePath, getDataRoot(), getTempPath()),
);

ipcMain.handle('workspace:read', async (_event, sessionId) => readWorkspaceFile(sessionId));

ipcMain.handle('workspace:write', async (_event, sessionId, base64) => writeWorkspaceFile(sessionId, base64));

ipcMain.handle('workspace:commit', async (_event, sessionId) => commitWorkspace(sessionId, getDataRoot()));

ipcMain.handle('workspace:rename', async (_event, sessionId, newRelativePath) =>
  renameWorkspace(sessionId, newRelativePath, getDataRoot()),
);

ipcMain.handle('workspace:close', async (_event, sessionId) => closeWorkspace(sessionId));

ipcMain.handle('editors:getStatus', async () => getEditorCoresStatus(getPortableRoot()));

ipcMain.handle('editors:update', async () => updateEditorCores(getPortableRoot()));

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  initAppContext({
    portableRoot: app.getAppPath(),
    dataRoot: path.join(app.getAppPath(), 'data'),
    tempPath: app.getPath('temp'),
    isDev,
    getServerInfo: () => ({
      port: activeServerInfo?.port ?? getSyncPort(),
      addresses: activeServerInfo?.addresses ?? getLocalIPv4Addresses(),
    }),
  });

  await ensureDataRoot();
  await ensureServer();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    shutdownServer();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await shutdownServer();
  await cleanupAllSessions(getTempPath());
});
