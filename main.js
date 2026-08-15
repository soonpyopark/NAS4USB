import { installStdioPipeGuard } from './electron/stdioGuard.js';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_BLOG_URL, APP_NAME, APP_VERSION } from './shared/constants.js';
import { resolveUniqueName } from './shared/uniqueName.js';
import {
  RELEASES_PAGE_URL,
  isUpdateAvailable,
  resolveUpdateKind,
  versionLabel,
} from './shared/updateCheck.js';
import { resolveAppIconPath, resolveAppIconImagePath } from './electron/appIcon.js';
import { setSessionSpellCheckerEnabled } from './electron/spellcheckSession.js';
import { fetchLatestRelease } from './electron/updateCheck.js';
import {
  ensureDataRoot,
  getAppPaths,
  getDataRoot,
  getPortableRoot,
  getExeRoot,
  getInstallRoot,
  getSyncInfo,
  getTempPath,
  initAppContext,
  resolvePortablePath,
  setExternalFolders,
} from './electron/appContext.js';
import * as fsService from './electron/fsService.js';
import {
  configureSyncServer,
  startSyncServer,
  stopSyncServer,
  getSyncPort,
  getSyncHostname,
  getLocalIPv4Addresses,
} from './electron/syncServer.js';
import { readServerEnvRaw, resolveDataRoot, resolveWorkspaceRoot } from './electron/envConfig.js';
import {
  hostnameForWebServerMode,
  normalizeWebServerMode,
  normalizeWebServerPort,
  resolveWebServerPort,
  webServerModeForHostname,
} from './shared/webServerConfig.js';
import { allowFirewallInbound, removeFirewallInbound } from './electron/firewallService.js';
import {
  START_HIDDEN_ARG,
  getAutoLaunchState,
  setAutoLaunch,
} from './electron/autoLaunchService.js';
import { ensureSampleDataSeeded } from './electron/seedDataService.js';
import {
  migrateUserDataStateToInstall,
  resolveExeRoot,
} from './electron/portablePaths.js';
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
import {
  loginAdmin,
  pruneRememberedSessions,
  revokeAdminSession,
  getAdminSession,
  isSuperAdminSession,
  isDefaultAdminPasswordActive,
} from './electron/authService.js';
import {
  assertAdminAuthenticated,
  assertSuperAdminAuthenticated,
  assertCanAccessTrash,
  assertCanAccessFile,
  assertCanEditFile,
  assertGuestCanWrite,
  assertHomeSystemPathMutable,
  filterTrashMapByHomeAccess,
  pathExistsWithAccessFilter,
  readDirWithAccessFilter,
  readFileBase64WithAccessFilter,
  resolveHomeScopedWritePath,
  statPathWithAccessFilter,
  assertCanClearFileHistoryTree,
} from './electron/fileAccessGuard.js';
import { filterFileAccessMap, canViewFileEntry } from './shared/fileAccessVisibility.js';
import {
  createShareLink,
  getShareMap,
  resolveShareToken,
  revokeShareLink,
  setShareLink,
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
  getFavoritesMap,
  listFavoriteEntries,
  setFavorite,
  syncFavoritesDelete,
  syncFavoritesRename,
} from './electron/favoritesService.js';
import {
  deletePermanent,
  emptyTrash,
  getTrashMap,
  restorePath,
  trashPath,
} from './electron/trashService.js';
import { getAppSettings, getAccessPermissionsBundle, getEffectiveAccessPermissions, getPublicUiPrefs, updateAppSettings, normalizeConfiguredDataRoot } from './electron/settingsService.js';
import {
  listMembers,
  saveMembersPayload,
  ensureBootstrapAdmin,
  getMembersExportRecords,
} from './electron/membersService.js';
import {
  syncFortuneSidecarCopy,
  syncFortuneSidecarDelete,
  syncFortuneSidecarRename,
  isFortuneSidecarRelativePath,
} from './electron/fortuneSidecarService.js';
import {
  syncPdfViewerSidecarCopy,
  syncPdfViewerSidecarDelete,
  syncPdfViewerSidecarRename,
  isPdfViewerSidecarRelativePath,
} from './electron/pdfViewerSidecarService.js';
import { closeComicArchive, openComicArchive } from './electron/comicArchive.js';
import { syncTiptapAssetRename } from './electron/tiptapAssetService.js';
import { notifyFsChanged } from './electron/fsNotifyService.js';
import {
  clearFileHistoryUnder,
  deleteFileHistoryEntry,
  listFileHistory,
  readFileHistoryBase64,
  readFileHistorySidecarSheets,
  restoreFileHistoryEntry,
  syncFileHistoryDelete,
  syncFileHistoryRename,
} from './electron/fileHistoryService.js';

installStdioPipeGuard();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // dialog requires app ready — defer the notice, then exit.
  app.whenReady().then(() => {
    dialog.showMessageBoxSync({
      type: 'info',
      title: APP_NAME,
      message: '프로그램이 이미 실행중입니다.',
      buttons: ['확인'],
    });
    app.exit(0);
  });
}

/** @type {{ port: number, addresses: string[], appUrl?: string } | null} */
let activeServerInfo = null;

let mainWindow = null;
/** @type {import('electron').BrowserWindow | null} */
let splashWindow = null;
/** @type {import('electron').Tray | null} */
let tray = null;
let isQuitting = false;

/** Auto-launch entries can request a tray-only start; only the very first window honours it. */
const launchedHidden = process.argv.includes(START_HIDDEN_ARG);

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

async function applySpellCheckerFromSettings() {
  try {
    const settings = await getAppSettings(getPortableRoot());
    setSessionSpellCheckerEnabled(settings.spellcheckEnabled);
  } catch {
    setSessionSpellCheckerEnabled(false);
  }
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
      // PDF viewer uses <webview> so findInPage/findNext works inside the PDF guest.
      webviewTag: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
    if (!launchedHidden) mainWindow?.show();
  });

  mainWindow.loadURL(currentAppUrl());
  void applySpellCheckerFromSettings();

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
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

/**
 * Stored 서버 관리 settings win over `.env`. An unset mode keeps the raw
 * `.env` HOSTNAME so custom bind addresses keep working.
 *
 * @param {string} root  exe/state folder (settings + .env)
 */
async function configureServerFromSettings(root) {
  const envRaw = readServerEnvRaw(root, isDev);
  const settings = await getAppSettings(root);
  const storedMode = normalizeWebServerMode(settings.webServerMode);

  configureSyncServer({
    port: resolveWebServerPort(settings.webServerPort, envRaw.portRaw),
    hostname: storedMode ? hostnameForWebServerMode(storedMode) : envRaw.hostname,
  });
}

function currentAppUrl() {
  return activeServerInfo?.appUrl ?? `http://127.0.0.1:${activeServerInfo?.port ?? getSyncPort()}`;
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

function getServerManagementInfo() {
  const running = activeServerInfo != null;
  return {
    running,
    port: running ? (activeServerInfo?.port ?? getSyncPort()) : null,
    configuredPort: getSyncPort(),
    mode: webServerModeForHostname(getSyncHostname()),
    hostname: getSyncHostname(),
    addresses: running ? (activeServerInfo?.addresses ?? []) : getLocalIPv4Addresses(),
    appUrl: running ? currentAppUrl() : null,
    autoLaunch: getAutoLaunchState(),
  };
}

/**
 * Rebind the server to a new port/mode. The renderer is served by this very
 * server, so the caller must navigate the window to the returned `appUrl`.
 *
 * @param {{ port: number, mode: import('./shared/webServerConfig.js').WebServerMode }} config
 */
async function restartServerWithConfig({ port, mode }) {
  const previous = { port: getSyncPort(), hostname: getSyncHostname() };
  await shutdownServer();
  configureSyncServer({ port, hostname: hostnameForWebServerMode(mode) });

  try {
    await ensureServer();
  } catch (err) {
    configureSyncServer(previous);
    await ensureServer().catch(() => {});
    updateTrayMenu();
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`서버를 ${port} 포트로 다시 시작하지 못했습니다.\n${detail}`);
  }

  updateTrayMenu();
  return getServerManagementInfo();
}

function resolveTrayIcon() {
  const iconPath = resolveAppIconImagePath() ?? resolveAppIconPath();
  if (iconPath && fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16, quality: 'best' });
    }
  }

  return nativeImage.createEmpty();
}

let trayUpdateCheckBusy = false;

async function checkForUpdatesFromTray() {
  if (trayUpdateCheckBusy) return;
  trayUpdateCheckBusy = true;
  try {
    const result = await fetchLatestRelease();
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const current = versionLabel(result.current);

    if (!result.ok) {
      const box = {
        type: 'warning',
        title: '업데이트 확인',
        message: '업데이트 정보를 확인할 수 없습니다.',
        detail: `${result.error || '알 수 없는 오류'}\n\n현재 버전: ${current}`,
        buttons: ['릴리스 페이지 열기', '닫기'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };
      const response = win
        ? await dialog.showMessageBox(win, box)
        : await dialog.showMessageBox(box);
      if (response.response === 0) {
        void shell.openExternal(RELEASES_PAGE_URL);
      }
      return;
    }

    if (isUpdateAvailable(result)) {
      const kind = resolveUpdateKind(result);
      const latest = versionLabel(result.latest || '');
      const stampHint =
        kind === 'build' && result.latestBuildStamp
          ? `\n최신 빌드: ${result.latestBuildStamp}`
          : '';
      const currentHint = result.currentBuildStamp
        ? `${current} (${result.currentBuildStamp})`
        : current;
      const box = {
        type: 'info',
        title: '업데이트 확인',
        message:
          kind === 'build'
            ? `같은 버전의 새 빌드가 있습니다: ${latest}`
            : `새 버전이 있습니다: ${latest}`,
        detail: `현재 버전: ${currentHint}${stampHint}`,
        buttons: ['다운로드', '나중에'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };
      const response = win
        ? await dialog.showMessageBox(win, box)
        : await dialog.showMessageBox(box);
      if (response.response === 0) {
        void shell.openExternal(result.releaseUrl || RELEASES_PAGE_URL);
      }
      return;
    }

    const currentHint = result.currentBuildStamp
      ? `${current} (${result.currentBuildStamp})`
      : current;
    const box = {
      type: 'info',
      title: '업데이트 확인',
      message: '최신 버전입니다.',
      detail: `현재 버전: ${currentHint}`,
      buttons: ['확인'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    if (win) await dialog.showMessageBox(win, box);
    else await dialog.showMessageBox(box);
  } finally {
    trayUpdateCheckBusy = false;
  }
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
      label: 'Update',
      click: () => {
        void checkForUpdatesFromTray();
      },
    },
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
      await mainWindow.loadURL(currentAppUrl());
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

ipcMain.handle('app:checkForUpdates', async () => fetchLatestRelease());

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid external URL');
  }
  await shell.openExternal(url);
  return true;
});

/** @type {WeakSet<import('electron').WebContents>} */
const findInPageListeners = new WeakSet();

/**
 * @param {import('electron').WebContents} webContents
 */
function ensureFindInPageListener(webContents) {
  if (findInPageListeners.has(webContents)) return;
  findInPageListeners.add(webContents);
  webContents.on('found-in-page', (_event, result) => {
    if (!webContents.isDestroyed()) {
      webContents.send('find:result', result);
    }
  });
}

ipcMain.handle('find:start', (event, text, options = {}) => {
  const webContents = event.sender;
  ensureFindInPageListener(webContents);
  const query = typeof text === 'string' ? text : '';
  if (!query) {
    webContents.stopFindInPage('clearSelection');
    return { requestId: 0 };
  }
  const requestId = webContents.findInPage(query, {
    forward: options?.forward !== false,
    findNext: Boolean(options?.findNext),
    matchCase: Boolean(options?.matchCase),
  });
  return { requestId };
});

ipcMain.handle('find:stop', (event, action = 'clearSelection') => {
  const webContents = event.sender;
  const mode =
    action === 'keepSelection' || action === 'activateSelection' ? action : 'clearSelection';
  webContents.stopFindInPage(mode);
  return true;
});

/** @type {WeakSet<import('electron').WebContents>} */
const pdfVolumePagingEnabled = new WeakSet();
/** @type {WeakSet<import('electron').WebContents>} */
const pdfVolumePagingHooked = new WeakSet();

/**
 * @param {import('electron').Input} input
 * @returns {'next' | 'prev' | null}
 */
function volumeKeyPageDirection(input) {
  const key = String(input.key || '');
  const code = String(input.code || '');
  if (key === 'AudioVolumeDown' || key === 'VolumeDown' || code === 'AudioVolumeDown') {
    return 'next';
  }
  if (key === 'AudioVolumeUp' || key === 'VolumeUp' || code === 'AudioVolumeUp') {
    return 'prev';
  }
  return null;
}

/**
 * @param {import('electron').WebContents} webContents
 */
function ensurePdfVolumePagingHook(webContents) {
  if (pdfVolumePagingHooked.has(webContents)) return;
  pdfVolumePagingHooked.add(webContents);
  webContents.on('before-input-event', (event, input) => {
    if (!pdfVolumePagingEnabled.has(webContents)) return;
    if (input.type !== 'keyDown') return;
    const direction = volumeKeyPageDirection(input);
    if (!direction) return;
    event.preventDefault();
    if (!webContents.isDestroyed()) {
      webContents.send('pdf:volumePageTurn', direction);
    }
  });
}

ipcMain.handle('pdf:setVolumeKeysForPaging', (event, enabled) => {
  const webContents = event.sender;
  ensurePdfVolumePagingHook(webContents);
  if (enabled) pdfVolumePagingEnabled.add(webContents);
  else pdfVolumePagingEnabled.delete(webContents);
  return true;
});

ipcMain.handle('comic:openArchive', async (event, relativePath) => {
  await assertCanAccessFile(relativePath, getAccessAuthFromEvent(event), getShareTokenFromEvent(event));
  return openComicArchive(relativePath);
});

ipcMain.handle('comic:closeArchive', async (_event, sessionId) => closeComicArchive(sessionId ?? ''));

ipcMain.handle('fs:openPath', async (_event, relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath) {
    throw new Error('열 파일 경로가 올바르지 않습니다.');
  }
  const absolutePath = resolvePortablePath(relativePath);
  const errorMessage = await shell.openPath(absolutePath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return true;
});

ipcMain.handle('dialog:pickDirectory', async (event, options = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: typeof options?.title === 'string' ? options.title : '폴더 선택',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pickFile', async (event, options = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  /** @type {import('electron').FileFilter[]} */
  const filters = Array.isArray(options?.filters) ? options.filters : undefined;
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: typeof options?.title === 'string' ? options.title : '파일 선택',
    properties: ['openFile'],
    filters,
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
    const existing = await fs.promises.readdir(dir).catch(() => []);
    targetName = resolveUniqueName(existing, fileName);
  }

  const absolutePath = path.join(dir, targetName);
  await fsService.ensureParentDir(absolutePath);
  await fs.promises.writeFile(absolutePath, Buffer.from(base64 ?? '', 'base64'));
  return { fileName: targetName, absolutePath };
});

ipcMain.handle('sync:getInfo', async () => {
  await ensureServer();
  return getSyncInfo();
});

ipcMain.handle('server:getInfo', async (event) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return getServerManagementInfo();
});

ipcMain.handle('server:applyConfig', async (event, patch = {}) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));

  const port = patch?.port == null ? null : normalizeWebServerPort(patch.port);
  if (patch?.port != null && port == null) {
    throw new Error('포트는 1~65535 사이 숫자여야 합니다.');
  }
  const mode = patch?.mode == null ? null : normalizeWebServerMode(patch.mode);
  if (patch?.mode != null && mode == null) {
    throw new Error('서버 모드가 올바르지 않습니다.');
  }

  /** @type {Record<string, unknown>} */
  const settingsPatch = {};
  if (port != null) settingsPatch.webServerPort = port;
  if (mode != null) settingsPatch.webServerMode = mode;
  if (Object.keys(settingsPatch).length > 0) {
    await updateAppSettings(settingsPatch, getPortableRoot());
  }

  const nextPort = port ?? getSyncPort();
  const nextMode = mode ?? webServerModeForHostname(getSyncHostname());
  const needsRestart =
    nextPort !== getSyncPort() ||
    hostnameForWebServerMode(nextMode) !== getSyncHostname() ||
    activeServerInfo == null;

  if (!needsRestart) {
    return { restarted: false, info: getServerManagementInfo() };
  }

  return { restarted: true, info: await restartServerWithConfig({ port: nextPort, mode: nextMode }) };
});

ipcMain.handle('server:setAutoLaunch', async (event, { enabled, startHidden } = {}) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return setAutoLaunch(Boolean(enabled), Boolean(startHidden));
});

ipcMain.handle('server:allowFirewall', async (event, port) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return allowFirewallInbound(port);
});

ipcMain.handle('server:removeFirewall', async (event, port) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return removeFirewallInbound(port);
});

/** @type {Map<number, string>} */
const adminTokenBySender = new Map();

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 * @returns {{ isLoggedIn: boolean, loginId: string | null, role: string | null }}
 */
function getAccessAuthFromEvent(event) {
  const token = adminTokenBySender.get(event.sender.id);
  const session = getAdminSession(token);
  return {
    isLoggedIn: Boolean(session),
    loginId: session?.adminId ?? null,
    role: session?.role === 'super_admin' ? 'super_admin' : session ? 'member' : null,
  };
}

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 */
function isAdminFromEvent(event) {
  return getAccessAuthFromEvent(event).isLoggedIn;
}

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 */
function isSuperAdminFromEvent(event) {
  const token = adminTokenBySender.get(event.sender.id);
  return isSuperAdminSession(token);
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

/** Returns the session so the renderer can drop stale storage instead of looking logged in. */
ipcMain.handle('auth:bindToken', (event, token) => {
  const session = getAdminSession(token);
  if (!session) {
    adminTokenBySender.delete(event.sender.id);
    return null;
  }
  adminTokenBySender.set(event.sender.id, token);
  return { adminId: session.adminId, role: session.role ?? 'member' };
});

ipcMain.handle('auth:logout', (event) => {
  const token = adminTokenBySender.get(event.sender.id);
  revokeAdminSession(token);
  adminTokenBySender.delete(event.sender.id);
  return true;
});

ipcMain.handle('fs:readDir', async (event, relativePath = '.') =>
  readDirWithAccessFilter(relativePath, getAccessAuthFromEvent(event), getPortableRoot()),
);

ipcMain.handle('fs:mkdir', async (event, relativePath) => {
  const auth = getAccessAuthFromEvent(event);
  const target = resolveHomeScopedWritePath(relativePath, auth);
  await assertCanEditFile(target, auth, getShareTokenFromEvent(event));
  const result = await fsService.mkdir(target);
  notifyFsChanged(target);
  return result;
});

ipcMain.handle('fs:rename', async (event, fromRelative, toRelative) => {
  const auth = getAccessAuthFromEvent(event);
  const shareToken = getShareTokenFromEvent(event);
  assertHomeSystemPathMutable(fromRelative, 'rename-source');
  assertHomeSystemPathMutable(toRelative, 'mutate');
  await assertCanEditFile(fromRelative, auth, shareToken);
  await assertCanEditFile(toRelative, auth, shareToken);
  await syncSharePathRename(fromRelative, toRelative, getPortableRoot());
  await syncFileAccessRename(fromRelative, toRelative, getPortableRoot());
  await syncFavoritesRename(fromRelative, toRelative, getPortableRoot());
  await syncFortuneSidecarRename(fromRelative, toRelative);
  await syncPdfViewerSidecarRename(fromRelative, toRelative);
  await syncTiptapAssetRename(fromRelative, toRelative);
  await syncFileHistoryRename(fromRelative, toRelative, getPortableRoot());
  const result = await fsService.renamePath(fromRelative, toRelative);
  notifyFsChanged([fromRelative, toRelative]);
  return result;
});

ipcMain.handle('fs:delete', async (event, relativePath) => {
  const auth = getAccessAuthFromEvent(event);
  const shareToken = getShareTokenFromEvent(event);
  assertHomeSystemPathMutable(relativePath, 'mutate');
  await assertCanEditFile(relativePath, auth, shareToken);
  if (isFortuneSidecarRelativePath(relativePath)) {
    throw new Error('FortuneSheet 편집용 보조 파일입니다. 연결된 스프레드시트를 삭제해 주세요.');
  }
  if (isPdfViewerSidecarRelativePath(relativePath)) {
    throw new Error('PDF 뷰어 보조 파일입니다. 연결된 PDF를 삭제해 주세요.');
  }
  await syncSharePathDelete(relativePath, getPortableRoot());
  await syncFileAccessDelete(relativePath, getPortableRoot());
  await syncFavoritesDelete(relativePath, getPortableRoot());
  await syncFortuneSidecarDelete(relativePath);
  await syncPdfViewerSidecarDelete(relativePath);
  await syncFileHistoryDelete(relativePath, getPortableRoot());
  const result = await fsService.deletePath(relativePath);
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fs:exists', async (event, relativePath) =>
  pathExistsWithAccessFilter(relativePath, getAccessAuthFromEvent(event), getShareTokenFromEvent(event)),
);

ipcMain.handle('fs:readFile', async (event, relativePath) =>
  readFileBase64WithAccessFilter(relativePath, getAccessAuthFromEvent(event), getShareTokenFromEvent(event)),
);

ipcMain.handle('fs:writeFile', async (event, relativePath, base64 = '') => {
  const auth = getAccessAuthFromEvent(event);
  const target = resolveHomeScopedWritePath(relativePath, auth);
  await assertCanEditFile(target, auth, getShareTokenFromEvent(event));
  const result = await fsService.writeFileBase64(target, base64);
  notifyFsChanged(target);
  return result;
});

ipcMain.handle('fs:copy', async (event, fromRelative, toRelative) => {
  const auth = getAccessAuthFromEvent(event);
  const shareToken = getShareTokenFromEvent(event);
  const dest = resolveHomeScopedWritePath(toRelative, auth);
  assertHomeSystemPathMutable(dest, 'mutate');
  await assertCanAccessFile(fromRelative, auth, shareToken);
  await assertCanEditFile(dest, auth, shareToken);
  const result = await fsService.copyPath(fromRelative, dest);
  await syncFortuneSidecarCopy(fromRelative, dest);
  await syncPdfViewerSidecarCopy(fromRelative, dest);
  notifyFsChanged([fromRelative, dest]);
  return result;
});

ipcMain.handle('fs:move', async (event, fromRelative, toRelative) => {
  const auth = getAccessAuthFromEvent(event);
  const shareToken = getShareTokenFromEvent(event);
  const dest = resolveHomeScopedWritePath(toRelative, auth);
  assertHomeSystemPathMutable(fromRelative, 'rename-source');
  assertHomeSystemPathMutable(dest, 'mutate');
  await assertCanEditFile(fromRelative, auth, shareToken);
  await assertCanEditFile(dest, auth, shareToken);
  await syncSharePathRename(fromRelative, dest, getPortableRoot());
  await syncFileAccessRename(fromRelative, dest, getPortableRoot());
  await syncFavoritesRename(fromRelative, dest, getPortableRoot());
  await syncFortuneSidecarRename(fromRelative, dest);
  await syncPdfViewerSidecarRename(fromRelative, dest);
  await syncTiptapAssetRename(fromRelative, dest);
  await syncFileHistoryRename(fromRelative, dest, getPortableRoot());
  const result = await fsService.movePath(fromRelative, dest);
  notifyFsChanged([fromRelative, dest]);
  return result;
});

ipcMain.handle('fs:stat', async (event, relativePath) =>
  statPathWithAccessFilter(relativePath, getAccessAuthFromEvent(event), getShareTokenFromEvent(event)),
);

/**
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {{ shareToken?: string }} [session]
 */
function resolveShareTokenForSession(event, session) {
  return session?.shareToken || getShareTokenFromEvent(event);
}

ipcMain.handle('workspace:open', async (event, relativePath, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanAccessFile(relativePath, getAccessAuthFromEvent(event), token);
  return openWorkspace(relativePath, getDataRoot(), getTempPath(), { shareToken: token });
});

ipcMain.handle('workspace:read', async (_event, sessionId) => readWorkspaceFile(sessionId));

ipcMain.handle('workspace:write', async (event, sessionId, base64) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, getAccessAuthFromEvent(event),
    resolveShareTokenForSession(event, session),
  );
  return writeWorkspaceFile(sessionId, base64);
});

ipcMain.handle('workspace:commit', async (event, sessionId) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, getAccessAuthFromEvent(event),
    resolveShareTokenForSession(event, session),
  );
  const result = await commitWorkspace(sessionId, getDataRoot());
  notifyFsChanged(session.relativePath);
  return result;
});

ipcMain.handle('workspace:save', async (event, sessionId, base64) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, getAccessAuthFromEvent(event),
    resolveShareTokenForSession(event, session),
  );
  const result = await saveWorkspace(sessionId, base64, getDataRoot());
  notifyFsChanged(session.relativePath);
  return result;
});

ipcMain.handle('workspace:rename', async (event, sessionId, newRelativePath) => {
  const session = getSession(sessionId);
  await assertCanEditFile(session.relativePath, getAccessAuthFromEvent(event),
    resolveShareTokenForSession(event, session),
  );
  const fromPath = session.relativePath;
  const result = await renameWorkspace(sessionId, newRelativePath, getDataRoot());
  await syncSharePathRename(fromPath, result.relativePath, getPortableRoot());
  await syncFileAccessRename(fromPath, result.relativePath, getPortableRoot());
  await syncFavoritesRename(fromPath, result.relativePath, getPortableRoot());
  await syncFortuneSidecarRename(fromPath, result.relativePath);
  await syncPdfViewerSidecarRename(fromPath, result.relativePath);
  await syncTiptapAssetRename(fromPath, result.relativePath);
  await syncFileHistoryRename(fromPath, result.relativePath, getPortableRoot());
  notifyFsChanged([fromPath, result.relativePath]);
  return result;
});

ipcMain.handle('workspace:close', async (_event, sessionId) => {
  const result = await closeWorkspace(sessionId);
  if (result.persisted && result.relativePath) notifyFsChanged(result.relativePath);
  return result;
});

ipcMain.handle('history:list', async (event, relativePath, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanAccessFile(relativePath, getAccessAuthFromEvent(event), token);
  return listFileHistory(relativePath, getPortableRoot());
});

ipcMain.handle('history:read', async (event, relativePath, entryId, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanAccessFile(relativePath, getAccessAuthFromEvent(event), token);
  return readFileHistoryBase64(relativePath, entryId, getPortableRoot());
});

ipcMain.handle('history:readSidecar', async (event, relativePath, entryId, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanAccessFile(relativePath, getAccessAuthFromEvent(event), token);
  return readFileHistorySidecarSheets(relativePath, entryId, getPortableRoot());
});

ipcMain.handle('history:delete', async (event, relativePath, entryId, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanEditFile(relativePath, getAccessAuthFromEvent(event), token);
  const result = await deleteFileHistoryEntry(relativePath, entryId, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('history:restore', async (event, relativePath, entryId, shareToken) => {
  const token = shareToken || getShareTokenFromEvent(event);
  await assertCanEditFile(relativePath, getAccessAuthFromEvent(event), token);
  const result = await restoreFileHistoryEntry(relativePath, entryId, getDataRoot(), getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('history:clearTree', async (event, relativePath) => {
  const target = await assertCanClearFileHistoryTree(
    relativePath,
    getAccessAuthFromEvent(event),
  );
  const result = await clearFileHistoryUnder(target, getPortableRoot());
  notifyFsChanged(target);
  return result;
});

ipcMain.handle('editors:getStatus', async () => getEditorCoresStatus(getExeRoot(), getInstallRoot()));

ipcMain.handle('tiptap:exportHwpx', async (_event, payload = {}) => {
  const { convertHtmlToHwpxBase64 } = await import('./electron/hwpxExportService.js');
  return convertHtmlToHwpxBase64({
    html: payload.html ?? '',
    fileName: payload.fileName ?? 'document.hwpx',
    assets: Array.isArray(payload.assets) ? payload.assets : [],
  });
});

ipcMain.handle('pdf:fromHtml', async (_event, payload = {}) => {
  const { convertHtmlToPdfBase64 } = await import('./electron/pdfExportService.js');
  return convertHtmlToPdfBase64({
    html: payload.html ?? '',
    fileName: payload.fileName ?? 'document.pdf',
    pageSize: payload.pageSize ?? 'A4',
    landscape: Boolean(payload.landscape),
    marginMm: payload.marginMm,
    printBackground: payload.printBackground,
  });
});

ipcMain.handle('tiptap:importOnenote', async (_event, payload = {}) => {
  const { convertOnenoteBase64 } = await import('./electron/onenoteImportService.js');
  return convertOnenoteBase64(payload.base64 ?? '', payload.fileName ?? 'section.one');
});

ipcMain.handle('editors:update', async (event) => {
  if (!isDev) {
    throw new Error('에디터 업데이트는 개발 모드에서만 사용할 수 있습니다.');
  }
  assertAdminAuthenticated(isAdminFromEvent(event));
  return updateEditorCores(getInstallRoot());
});

ipcMain.handle('auth:login', async (_event, { id, password, rememberMe } = {}) =>
  loginAdmin(id, password, getPortableRoot(), { remember: Boolean(rememberMe) }),
);

ipcMain.handle('auth:showDefaultAdminHint', async () =>
  isDefaultAdminPasswordActive(getPortableRoot()),
);

ipcMain.handle('share:getMap', async (event) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  return getShareMap(getPortableRoot());
});

ipcMain.handle('share:create', async (event, { path: relativePath, mode } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await createShareLink(relativePath, mode, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('share:setMode', async (event, { path: relativePath, mode } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await setShareLink(relativePath, mode ?? null, getPortableRoot());
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
  const auth = getAccessAuthFromEvent(event);
  const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
  return filterFileAccessMap(accessMap, Boolean(perms.write));
});

ipcMain.handle('fileAccess:set', async (event, { path: relativePath, visibility, viewRestricted } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await setFileAccess(relativePath, { visibility, viewRestricted }, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('fileAccess:canEdit', async (event, relativePath) => {
  try {
    await assertCanEditFile(relativePath, getAccessAuthFromEvent(event), getShareTokenFromEvent(event));
    return { canEdit: true };
  } catch (error) {
    return {
      canEdit: false,
      message: error instanceof Error ? error.message : '공개된 문서만 편집할 수 있습니다.',
    };
  }
});

ipcMain.handle('favorites:getMap', async (event) => {
  const auth = getAccessAuthFromEvent(event);
  const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
  if (!perms.view && !perms.write) return {};
  if (perms.write) {
    return getFavoritesMap(getPortableRoot());
  }
  const map = await getFavoritesMap(getPortableRoot());
  const accessMap = await getFileAccessMap(getPortableRoot());
  return Object.fromEntries(
    Object.entries(map).filter(([path]) => canViewFileEntry(path, accessMap, false)),
  );
});

ipcMain.handle('favorites:listEntries', async (event) => {
  const auth = getAccessAuthFromEvent(event);
  const perms = await getEffectiveAccessPermissions(auth, getPortableRoot());
  if (!perms.view && !perms.write) return [];
  if (perms.write) {
    return listFavoriteEntries(getPortableRoot());
  }
  const entries = await listFavoriteEntries(getPortableRoot());
  const accessMap = await getFileAccessMap(getPortableRoot());
  return entries.filter((entry) => canViewFileEntry(entry.relativePath, accessMap, false));
});

ipcMain.handle('favorites:set', async (event, { path: relativePath, favorited } = {}) => {
  assertAdminAuthenticated(isAdminFromEvent(event));
  const result = await setFavorite(relativePath, Boolean(favorited), getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('trash:getMap', async (event) => {
  const auth = getAccessAuthFromEvent(event);
  await assertCanAccessTrash(auth);
  return filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth);
});

ipcMain.handle('trash:move', async (event, { path: relativePath } = {}) => {
  const auth = getAccessAuthFromEvent(event);
  const shareToken = getShareTokenFromEvent(event);
  assertHomeSystemPathMutable(relativePath, 'mutate');
  await assertCanEditFile(relativePath, auth, shareToken);
  const result = await trashPath(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('trash:restore', async (event, { path: relativePath } = {}) => {
  const auth = getAccessAuthFromEvent(event);
  await assertCanAccessTrash(auth);
  const map = filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth);
  if (!map[String(relativePath ?? '').replace(/\\/g, '/')]) {
    throw new Error('휴지통 정보를 찾을 수 없습니다.');
  }
  const originalPath = map[String(relativePath ?? '').replace(/\\/g, '/')].originalPath;
  await assertCanEditFile(originalPath, auth, getShareTokenFromEvent(event));
  const result = await restorePath(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('trash:empty', async (event) => {
  await assertGuestCanWrite(getAccessAuthFromEvent(event));
  const result = await emptyTrash(getPortableRoot());
  notifyFsChanged();
  return result;
});

ipcMain.handle('trash:deletePermanent', async (event, { path: relativePath } = {}) => {
  const auth = getAccessAuthFromEvent(event);
  await assertCanAccessTrash(auth);
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  const map = filterTrashMapByHomeAccess(await getTrashMap(getPortableRoot()), auth);
  if (normalized.startsWith('__trash/') && !map[normalized]) {
    throw new Error('휴지통 정보를 찾을 수 없습니다.');
  }
  assertHomeSystemPathMutable(relativePath, 'mutate');
  if (!normalized.startsWith('__trash/')) {
    await assertCanEditFile(relativePath, auth, getShareTokenFromEvent(event));
  }
  const result = await deletePermanent(relativePath, getPortableRoot());
  notifyFsChanged(relativePath);
  return result;
});

ipcMain.handle('settings:get', async (event) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return getAppSettings(getPortableRoot());
});

ipcMain.handle('settings:getGuestPermissions', async (event) => getAccessPermissionsBundle(getPortableRoot(), getAccessAuthFromEvent(event)));

ipcMain.handle('settings:getTheme', async () => getPublicUiPrefs(getPortableRoot()));

ipcMain.handle('settings:update', async (event, patch = {}) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  const result = await updateAppSettings(patch, getPortableRoot());
  if (patch && 'externalFolders' in patch) {
    setExternalFolders(result.externalFolders);
  }
  if (patch && 'spellcheckEnabled' in patch) {
    setSessionSpellCheckerEnabled(result.spellcheckEnabled);
  }
  if (patch && 'videoPreviewCacheMaxBytes' in patch) {
    const { pruneVideoPreviewCache } = await import('./electron/ffmpegPreviewService.js');
    await pruneVideoPreviewCache(getPortableRoot()).catch(() => {});
  }
  notifyFsChanged();
  return result;
});

/**
 * Persist workspace root under 설정 → 일반, then relaunch so open files / Yjs rooms
 * bind to the new tree. Pass null/empty to fall back to `{portableRoot}`
 * (with `share/` + `private/` under it; `.env` DATA_ROOT if set).
 */
ipcMain.handle('settings:applyDataRoot', async (event, rawPath = null) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  const portableRoot = getPortableRoot();
  let configured = normalizeConfiguredDataRoot(rawPath);

  if (configured) {
    configured = path.isAbsolute(configured)
      ? path.normalize(configured)
      : path.resolve(portableRoot, configured);
    await fs.promises.mkdir(configured, { recursive: true });
  }

  const settings = await updateAppSettings({ dataRoot: configured }, portableRoot);
  const workspaceRoot = resolveWorkspaceRoot(portableRoot, settings.dataRoot);
  const effective = resolveDataRoot(portableRoot, settings.dataRoot);

  setImmediate(() => {
    isQuitting = true;
    app.relaunch();
    app.exit(0);
  });

  return {
    ok: true,
    willRelaunch: true,
    configured: settings.dataRoot,
    workspaceRoot,
    effective,
    defaultDataRoot: portableRoot,
  };
});

ipcMain.handle('members:list', async (event) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  return listMembers(getPortableRoot());
});

ipcMain.handle('members:export', async (event) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  const settings = await getAppSettings(getPortableRoot());
  return {
    members: await getMembersExportRecords(getPortableRoot()),
    guestPermissions: settings.guestPermissions,
  };
});

ipcMain.handle('members:save', async (event, payload = {}) => {
  assertSuperAdminAuthenticated(isSuperAdminFromEvent(event));
  const result = await saveMembersPayload(payload, getPortableRoot());
  if (result.ok) notifyFsChanged();
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
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.nas4usb.app');
    }
    if (!launchedHidden) createSplashWindow();

    const exeRoot = resolveExeRoot(isDev);
    await migrateUserDataStateToInstall(exeRoot);

    let settings = await getAppSettings(exeRoot);
    try {
      const { prepareWorkspaceLayout } = await import('./electron/workspaceLayoutMigration.js');
      const nextSettings = await prepareWorkspaceLayout(exeRoot, settings);
      if (nextSettings?.dataRoot !== settings.dataRoot) {
        settings = await updateAppSettings({ dataRoot: nextSettings.dataRoot }, exeRoot);
      } else {
        settings = nextSettings;
      }
    } catch (err) {
      console.warn('[data] workspace layout prepare failed:', err);
    }

    const workspaceRoot = resolveWorkspaceRoot(exeRoot, settings.dataRoot);
    const dataRoot = resolveDataRoot(exeRoot, settings.dataRoot);
    console.log(
      `[data] workspaceRoot=${workspaceRoot}` +
        (settings.dataRoot ? ` (configured=${settings.dataRoot})` : ' (default)') +
        `; share=${dataRoot}; install=${exeRoot}`,
    );
    await configureServerFromSettings(exeRoot);

    initAppContext({
      portableRoot: exeRoot,
      exeRoot,
      installRoot: app.getAppPath(),
      workspaceRoot,
      dataRoot,
      tempPath: app.getPath('temp'),
      isDev,
      externalFolders: settings.externalFolders,
      getServerInfo: () => ({
        port: activeServerInfo?.port ?? getSyncPort(),
        addresses: activeServerInfo?.addresses ?? getLocalIPv4Addresses(),
      }),
    });

    try {
      const { finalizeWorkspaceLayout } = await import('./electron/workspaceLayoutMigration.js');
      await finalizeWorkspaceLayout();
    } catch (err) {
      console.warn('[data] workspace layout finalize failed:', err);
    }
    await ensureDataRoot();
    try {
      const seedResult = await ensureSampleDataSeeded({ isDev });
      if (seedResult.seeded) {
        console.log(`[data] seeded samples from ${seedResult.from}`);
      }
    } catch (err) {
      console.warn('[data] sample seed failed:', err);
    }
    try {
      await ensureBootstrapAdmin(exeRoot);
    } catch (err) {
      console.warn('[auth] bootstrap admin seed failed:', err);
    }

    try {
      const { ensureAllMemberHomes } = await import('./electron/memberHomeService.js');
      await ensureAllMemberHomes(exeRoot);
    } catch (err) {
      console.warn('[data] ensure member homes failed:', err);
    }

    try {
      const { pruneOrphanPdfViewerSidecarsInWorkspace } = await import(
        './electron/pdfViewerSidecarService.js'
      );
      const pruned = await pruneOrphanPdfViewerSidecarsInWorkspace();
      if (pruned.deleted.length) {
        console.log(`[pdf] removed ${pruned.deleted.length} orphan viewer sidecar(s)`);
      }
    } catch (err) {
      console.warn('[pdf] orphan viewer sidecar prune failed:', err);
    }

    try {
      const { pruneVideoPreviewCache } = await import('./electron/ffmpegPreviewService.js');
      const pruned = await pruneVideoPreviewCache();
      if (pruned.deleted.length) {
        console.log(`[video] pruned ${pruned.deleted.length} preview cache folder(s)`);
      }
    } catch (err) {
      console.warn('[video] preview cache prune failed:', err);
    }

    try {
      await pruneRememberedSessions(exeRoot);
    } catch (err) {
      console.warn('[auth] session prune failed:', err);
    }

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
