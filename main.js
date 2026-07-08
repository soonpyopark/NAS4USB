import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_BLOG_URL, APP_NAME, APP_VERSION } from './shared/constants.js';
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
  saveWorkspace,
  writeWorkspaceFile,
} from './electron/tempWorkspace.js';
import { getEditorCoresStatus, updateEditorCores } from './electron/editorUpdater.js';
import { loginAdmin, isValidAdminSession, revokeAdminSession } from './electron/authService.js';
import {
  assertAdminAuthenticated,
  assertCanAccessTrash,
  assertCanAccessFile,
  assertCanEditFile,
  pathExistsWithAccessFilter,
  readDirWithAccessFilter,
  readFileBase64WithAccessFilter,
  statPathWithAccessFilter,
} from './electron/fileAccessGuard.js';
import { filterFileAccessMap } from './shared/fileAccessVisibility.js';
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
import { notifyFsChanged } from './electron/fsNotifyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/** @type {{ port: number, addresses: string[], appUrl?: string } | null} */
let activeServerInfo = null;

let mainWindow = null;
/** @type {import('electron').BrowserWindow | null} */
let splashWindow = null;
/** @type {import('electron').Tray | null} */
let tray = null;
let isQuitting = false;

function resolveElectronDir() {
  return path.join(__dirname, 'electron');
}

function setupSplashExternalLinks(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function showSplashWindow(mode) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    if (mode === 'loading') {
      return;
    }
    splashWindow.close();
    splashWindow = null;
  }

  const iconPath = resolveAppIconPath();

  splashWindow = new BrowserWindow({
    width: 400,
    height: mode === 'about' ? 130 : 110,
    frame: false,
    alwaysOnTop: mode === 'loading',
    skipTaskbar: mode === 'loading',
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0a1a33',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.setMenu(null);
  void splashWindow.loadFile(path.join(resolveElectronDir(), 'splash.html'), {
    query: {
      mode,
      title: APP_NAME,
      blog: APP_BLOG_URL,
      version: APP_VERSION,
    },
  });

  setupSplashExternalLinks(splashWindow);

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createSplashWindow() {
  showSplashWindow('loading');
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

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
    show: false,
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

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
    mainWindow?.show();
  });

  const appUrl =
    activeServerInfo?.appUrl ?? `http://127.0.0.1:${activeServerInfo?.port ?? getSyncPort()}`;

  mainWindow.loadURL(appUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function ensureServer() {
  if (activeServerInfo) return activeServerInfo;

  if (isDev) {
    const { startDevServer } = await import('./electron/devServer.js');
    activeServerInfo = await startDevServer();
  } else {
    activeServerInfo = startSyncServer(path.join(__dirname, 'dist'));
  }

  return activeServerInfo;
}

async function shutdownServer() {
  if (isDev) {
    const { stopDevServer } = await import('./electron/devServer.js');
    await stopDevServer();
  } else {
    stopSyncServer();
  }
  activeServerInfo = null;
  updateTrayMenu();
}

function resolveTrayIcon() {
  const iconPath = resolveAppIconPath();
  if (iconPath && fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16 });
    }
  }

  return nativeImage.createEmpty();
}

function buildTrayMenu() {
  const serverRunning = activeServerInfo != null;

  return Menu.buildFromTemplate([
    {
      label: 'Stop Server',
      enabled: serverRunning,
      click: () => {
        void stopServerFromTray();
      },
    },
    {
      label: 'Start Server',
      enabled: !serverRunning,
      click: () => {
        void startServerFromTray();
      },
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => {
        showSplashWindow('about');
      },
    },
    {
      label: 'Exit',
      click: () => {
        quitFromTray();
      },
    },
  ]);
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildTrayMenu());
}

async function stopServerFromTray() {
  if (!activeServerInfo) return;

  try {
    await shutdownServer();
    console.log('[tray] Server stopped.');
  } catch (err) {
    console.error('[tray] Failed to stop server:', err);
  }
}

async function startServerFromTray() {
  if (activeServerInfo) return;

  try {
    await ensureServer();
    updateTrayMenu();

    if (mainWindow && !mainWindow.isDestroyed()) {
      const appUrl =
        activeServerInfo?.appUrl ?? `http://127.0.0.1:${activeServerInfo?.port ?? getSyncPort()}`;
      await mainWindow.loadURL(appUrl);
    }

    console.log('[tray] Server started.');
  } catch (err) {
    console.error('[tray] Failed to start server:', err);
  }
}

function quitFromTray() {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
  app.quit();
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;

  tray = new Tray(resolveTrayIcon());
  tray.setToolTip(APP_NAME);
  updateTrayMenu();

  tray.on('double-click', () => {
    focusMainWindow();
  });
}

ipcMain.handle('app:getPaths', () => getAppPaths());

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid external URL');
  }
  await shell.openExternal(url);
  return true;
});

/**
 * @param {string[]} existingNames
 * @param {string} desiredName
 */
function resolveUniqueFileName(existingNames, desiredName) {
  const names = new Set(existingNames);
  if (!names.has(desiredName)) return desiredName;

  const extIndex = desiredName.lastIndexOf('.');
  const hasExt = extIndex > 0;
  const stem = hasExt ? desiredName.slice(0, extIndex) : desiredName;
  const ext = hasExt ? desiredName.slice(extIndex) : '';

  let counter = 1;
  while (names.has(`${stem} (${counter})${ext}`)) counter += 1;
  return `${stem} (${counter})${ext}`;
}

ipcMain.handle('dialog:pickDirectory', async (event, options = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: typeof options?.title === 'string' ? options.title : '폴더 선택',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('fs:writeFileAbsolute', async (_event, params = {}) => {
  const { directory, fileName, base64, unique = true } = params;
  if (typeof directory !== 'string' || typeof fileName !== 'string') {
    throw new Error('저장 경로가 올바르지 않습니다.');
  }

  const dir = path.resolve(directory);
  let targetName = fileName;
  if (unique) {
    const existing = await fs.readdir(dir).catch(() => []);
    targetName = resolveUniqueFileName(existing, fileName);
  }

  const absolutePath = path.join(dir, targetName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(base64 ?? '', 'base64'));
  return { fileName: targetName, absolutePath };
});

ipcMain.handle('sync:getInfo', async () => {
  await ensureServer();
  return getSyncInfo();
});

/** @type {Map<number, string>} */
const adminTokenBySender = new Map();

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 */
function isAdminFromEvent(event) {
  const token = adminTokenBySender.get(event.sender.id);
  return isValidAdminSession(token);
}

/** @type {Map<number, string>} */
const shareTokenBySender = new Map();

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 */
function getShareTokenFromEvent(event) {
  return shareTokenBySender.get(event.sender.id);
}

ipcMain.handle('auth:bindShareToken', (event, token) => {
  if (token) {
    shareTokenBySender.set(event.sender.id, token);
  } else {
    shareTokenBySender.delete(event.sender.id);
  }
  return true;
});

ipcMain.handle('auth:bindToken', (event, token) => {
  if (token && isValidAdminSession(token)) {
    adminTokenBySender.set(event.sender.id, token);
    return true;
  }
  adminTokenBySender.delete(event.sender.id);
  return false;
});

ipcMain.handle('auth:logout', (event) => {
  const token = adminTokenBySender.get(event.sender.id);
  revokeAdminSession(token);
  adminTokenBySender.delete(event.sender.id);
  return true;
});

ipcMain.handle('fs:readDir', async (event, relativePath = '.') =>
  readDirWithAccessFilter(relativePath, isAdminFromEvent(event), getPortableRoot()),
);

ipcMain.handle('fs:mkdir', async (_event, relativePath) => {
  const result = await fsService.mkdir(relativePath);
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fs:rename', async (_event, fromRelative, toRelative) => {
  await syncSharePathRename(fromRelative, toRelative, getPortableRoot());
  await syncFileAccessRename(fromRelative, toRelative, getPortableRoot());
  const result = await fsService.renamePath(fromRelative, toRelative);
  notifyFsChanged([fromRelative, toRelative]);
  return result;
});

ipcMain.handle('fs:delete', async (_event, relativePath) => {
  await syncSharePathDelete(relativePath, getPortableRoot());
  await syncFileAccessDelete(relativePath, getPortableRoot());
  const result = await fsService.deletePath(relativePath);
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fs:exists', async (event, relativePath) =>
  pathExistsWithAccessFilter(relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event)),
);

ipcMain.handle('fs:readFile', async (event, relativePath) =>
  readFileBase64WithAccessFilter(relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event)),
);

ipcMain.handle('fs:writeFile', async (_event, relativePath, base64 = '') => {
  const result = await fsService.writeFileBase64(relativePath, base64);
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fs:copy', async (_event, fromRelative, toRelative) => {
  const result = await fsService.copyPath(fromRelative, toRelative);
  notifyFsChanged([fromRelative, toRelative]);
  return result;
});

ipcMain.handle('fs:move', async (_event, fromRelative, toRelative) => {
  await syncSharePathRename(fromRelative, toRelative, getPortableRoot());
  await syncFileAccessRename(fromRelative, toRelative, getPortableRoot());
  const result = await fsService.movePath(fromRelative, toRelative);
  notifyFsChanged([fromRelative, toRelative]);
  return result;
});

ipcMain.handle('fs:stat', async (event, relativePath) =>
  statPathWithAccessFilter(relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event)),
);

ipcMain.handle('workspace:open', async (event, relativePath, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanAccessFile(relativePath, isAdminFromEvent(event), token);
  return openWorkspace(relativePath, getDataRoot(), getTempPath());
});

ipcMain.handle('workspace:read', async (_event, sessionId) => readWorkspaceFile(sessionId));

ipcMain.handle('workspace:write', async (event, sessionId, base64) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event));
  return writeWorkspaceFile(sessionId, base64);
});

ipcMain.handle('workspace:commit', async (event, sessionId) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event));
  const result = await commitWorkspace(sessionId, getDataRoot());
  notifyFsChanged(session.relativePath);
  return result;
});

ipcMain.handle('workspace:save', async (event, sessionId, base64) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event));
  const result = await saveWorkspace(sessionId, base64, getDataRoot());
  notifyFsChanged(session.relativePath);
  return result;
});

ipcMain.handle('workspace:rename', async (event, sessionId, newRelativePath) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event));
  const fromPath = session.relativePath;
  const result = await renameWorkspace(sessionId, newRelativePath, getDataRoot());
  await syncSharePathRename(fromPath, result.relativePath, getPortableRoot());
  await syncFileAccessRename(fromPath, result.relativePath, getPortableRoot());
  notifyFsChanged([fromPath, result.relativePath]);
  return result;
});

ipcMain.handle('workspace:close', async (_event, sessionId) => closeWorkspace(sessionId));

ipcMain.handle('editors:getStatus', async () => getEditorCoresStatus(getPortableRoot()));

ipcMain.handle('editors:update', async () => updateEditorCores(getPortableRoot()));

ipcMain.handle('auth:login', async (_event, { id, password } = {}) =>
  loginAdmin(id, password, getPortableRoot()),
);

ipcMain.handle('share:getMap', async (event) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  return getShareMap(getPortableRoot());
});

ipcMain.handle('share:create', async (event, { path: relativePath } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await createShareLink(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('share:revoke', async (event, { path: relativePath } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await revokeShareLink(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('share:resolve', async (_event, { token } = {}) =>
  resolveShareToken(token, getPortableRoot()),
);

ipcMain.handle('fileAccess:getMap', async (event) => {
  const accessMap = await getFileAccessMap(getPortableRoot());
  return filterFileAccessMap(accessMap, isAdminFromEvent(event));
});

ipcMain.handle('fileAccess:set', async (event, { path: relativePath, visibility, viewRestricted } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await setFileAccess(relativePath, { visibility, viewRestricted }, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fileAccess:canEdit', async (event, relativePath) => {
  try {
    await assertCanEditFile(relativePath, isAdminFromEvent(event), getShareTokenFromEvent(event));
    return { canEdit: true };
  } catch (error) {
    return {
      canEdit: false,
      message: error instanceof Error ? error.message : '공개된 문서만 편집할 수 있습니다.',
    };
  }
});

ipcMain.handle('trash:getMap', async (event) => {
  assertCanAccessTrash(isAdminFromEvent(event));
  return getTrashMap(getPortableRoot());
});

ipcMain.handle('trash:move', async (_event, { path: relativePath } = {}) => {
  const result = await trashPath(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('trash:restore', async (event, { path: relativePath } = {}) => {
  assertCanAccessTrash(isAdminFromEvent(event));
  const result = await restorePath(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('trash:empty', async (event) => {
  assertCanAccessTrash(isAdminFromEvent(event));
  const result = await emptyTrash(getPortableRoot());
  notifyFsChanged();
  return result;
});

ipcMain.handle('trash:deletePermanent', async (event, { path: relativePath } = {}) => {
  assertCanAccessTrash(isAdminFromEvent(event));
  const result = await deletePermanent(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    createSplashWindow();

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
      closeSplashWindow();
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
    createTray();
    updateTrayMenu();

    app.on('activate', () => {
      focusMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Main window hides to tray — keep the app and server running.
});

app.on('before-quit', async () => {
  isQuitting = true;
  closeSplashWindow();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  await shutdownServer();
  await cleanupAllSessions(getTempPath());
});
