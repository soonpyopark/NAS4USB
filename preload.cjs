const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nas4usb', {
  __source: 'electron',
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getSyncInfo: () => ipcRenderer.invoke('sync:getInfo'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  dialog: {
    pickDirectory: (options) => ipcRenderer.invoke('dialog:pickDirectory', options),
    pickFile: (options) => ipcRenderer.invoke('dialog:pickFile', options),
  },
  subscribeFsChanged: (callback) => {
    const handler = (_event, payload) => {
      if (typeof payload === 'number') {
        callback({ revision: payload });
        return;
      }
      callback(payload && typeof payload === 'object' ? payload : {});
    };
    ipcRenderer.on('fs:changed', handler);
    return () => {
      ipcRenderer.removeListener('fs:changed', handler);
    };
  },

  fs: {
    readDir: (relativePath) => ipcRenderer.invoke('fs:readDir', relativePath),
    mkdir: (relativePath) => ipcRenderer.invoke('fs:mkdir', relativePath),
    delete: (relativePath) => ipcRenderer.invoke('fs:delete', relativePath),
    rename: (fromRelative, toRelative) => ipcRenderer.invoke('fs:rename', fromRelative, toRelative),
    exists: (relativePath) => ipcRenderer.invoke('fs:exists', relativePath),
    readFile: (relativePath) => ipcRenderer.invoke('fs:readFile', relativePath),
    writeFile: (relativePath, base64) => ipcRenderer.invoke('fs:writeFile', relativePath, base64),
    copy: (fromRelative, toRelative) => ipcRenderer.invoke('fs:copy', fromRelative, toRelative),
    move: (fromRelative, toRelative) => ipcRenderer.invoke('fs:move', fromRelative, toRelative),
    stat: (relativePath) => ipcRenderer.invoke('fs:stat', relativePath),
    writeFileAbsolute: (params) => ipcRenderer.invoke('fs:writeFileAbsolute', params),
    openPath: (relativePath) => ipcRenderer.invoke('fs:openPath', relativePath),
  },

  workspace: {
    open: (relativePath, shareToken) => ipcRenderer.invoke('workspace:open', relativePath, shareToken),
    read: (sessionId) => ipcRenderer.invoke('workspace:read', sessionId),
    write: (sessionId, base64) => ipcRenderer.invoke('workspace:write', sessionId, base64),
    commit: (sessionId) => ipcRenderer.invoke('workspace:commit', sessionId),
    save: (sessionId, base64) => ipcRenderer.invoke('workspace:save', sessionId, base64),
    rename: (sessionId, relativePath) =>
      ipcRenderer.invoke('workspace:rename', sessionId, relativePath),
    close: (sessionId) => ipcRenderer.invoke('workspace:close', sessionId),
  },

  editors: {
    getStatus: () => ipcRenderer.invoke('editors:getStatus'),
    update: () => ipcRenderer.invoke('editors:update'),
  },

  tiptap: {
    exportHwpx: (payload) => ipcRenderer.invoke('tiptap:exportHwpx', payload ?? {}),
  },

  auth: {
    login: ({ id, password, rememberMe }) =>
      ipcRenderer.invoke('auth:login', { id, password, rememberMe }),
    showDefaultAdminHint: () => ipcRenderer.invoke('auth:showDefaultAdminHint'),
    bindToken: (token) => ipcRenderer.invoke('auth:bindToken', token ?? ''),
    bindShareToken: (token) => ipcRenderer.invoke('auth:bindShareToken', token ?? ''),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  share: {
    getMap: () => ipcRenderer.invoke('share:getMap'),
    create: ({ path, mode }) => ipcRenderer.invoke('share:create', { path, mode }),
    setMode: ({ path, mode }) => ipcRenderer.invoke('share:setMode', { path, mode }),
    revoke: ({ path }) => ipcRenderer.invoke('share:revoke', { path }),
    resolve: ({ token }) => ipcRenderer.invoke('share:resolve', { token }),
  },

  fileAccess: {
    getMap: () => ipcRenderer.invoke('fileAccess:getMap'),
    canEdit: (relativePath) => ipcRenderer.invoke('fileAccess:canEdit', relativePath),
    set: ({ path, visibility, viewRestricted }) =>
      ipcRenderer.invoke('fileAccess:set', { path, visibility, viewRestricted }),
  },

  favorites: {
    getMap: () => ipcRenderer.invoke('favorites:getMap'),
    listEntries: () => ipcRenderer.invoke('favorites:listEntries'),
    set: ({ path, favorited }) => ipcRenderer.invoke('favorites:set', { path, favorited }),
  },

  trash: {
    getMap: () => ipcRenderer.invoke('trash:getMap'),
    move: (relativePath) => ipcRenderer.invoke('trash:move', { path: relativePath }),
    restore: (relativePath) => ipcRenderer.invoke('trash:restore', { path: relativePath }),
    empty: () => ipcRenderer.invoke('trash:empty'),
    deletePermanent: (relativePath) =>
      ipcRenderer.invoke('trash:deletePermanent', { path: relativePath }),
  },

  history: {
    list: (relativePath, shareToken) => ipcRenderer.invoke('history:list', relativePath, shareToken),
    read: (relativePath, entryId, shareToken) =>
      ipcRenderer.invoke('history:read', relativePath, entryId, shareToken),
    readSidecar: (relativePath, entryId, shareToken) =>
      ipcRenderer.invoke('history:readSidecar', relativePath, entryId, shareToken),
    deleteEntry: (relativePath, entryId, shareToken) =>
      ipcRenderer.invoke('history:delete', relativePath, entryId, shareToken),
    restore: (relativePath, entryId, shareToken) =>
      ipcRenderer.invoke('history:restore', relativePath, entryId, shareToken),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    getGuestPermissions: () => ipcRenderer.invoke('settings:getGuestPermissions'),
    getTheme: () => ipcRenderer.invoke('settings:getTheme'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    applyDataRoot: (path) => ipcRenderer.invoke('settings:applyDataRoot', path),
  },

  server: {
    getInfo: () => ipcRenderer.invoke('server:getInfo'),
    applyConfig: (patch) => ipcRenderer.invoke('server:applyConfig', patch),
    setAutoLaunch: (options) => ipcRenderer.invoke('server:setAutoLaunch', options),
    allowFirewall: (port) => ipcRenderer.invoke('server:allowFirewall', port),
    removeFirewall: (port) => ipcRenderer.invoke('server:removeFirewall', port),
  },

  members: {
    list: () => ipcRenderer.invoke('members:list'),
    export: () => ipcRenderer.invoke('members:export'),
    save: (payload) => ipcRenderer.invoke('members:save', payload ?? {}),
  },

  find: {
    start: (text, options) => ipcRenderer.invoke('find:start', text, options),
    stop: (action) => ipcRenderer.invoke('find:stop', action),
    subscribe: (callback) => {
      const handler = (_event, result) => {
        callback(result);
      };
      ipcRenderer.on('find:result', handler);
      return () => {
        ipcRenderer.removeListener('find:result', handler);
      };
    },
  },

  pdfViewer: {
    setVolumeKeysForPaging: (enabled) =>
      ipcRenderer.invoke('pdf:setVolumeKeysForPaging', Boolean(enabled)),
    subscribeVolumePageTurn: (callback) => {
      const handler = (_event, direction) => {
        callback(direction);
      };
      ipcRenderer.on('pdf:volumePageTurn', handler);
      return () => {
        ipcRenderer.removeListener('pdf:volumePageTurn', handler);
      };
    },
  },

  comic: {
    openArchive: (relativePath) => ipcRenderer.invoke('comic:openArchive', relativePath),
    closeArchive: (sessionId) => ipcRenderer.invoke('comic:closeArchive', sessionId),
  },
});
