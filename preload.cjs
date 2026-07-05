const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('educowork', {
  __source: 'electron',
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getSyncInfo: () => ipcRenderer.invoke('sync:getInfo'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
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
    openPath: (relativePath) => ipcRenderer.invoke('fs:openPath', relativePath),
    exists: (relativePath) => ipcRenderer.invoke('fs:exists', relativePath),
    readFile: (relativePath) => ipcRenderer.invoke('fs:readFile', relativePath),
    writeFile: (relativePath, base64) => ipcRenderer.invoke('fs:writeFile', relativePath, base64),
    copy: (fromRelative, toRelative) => ipcRenderer.invoke('fs:copy', fromRelative, toRelative),
    move: (fromRelative, toRelative) => ipcRenderer.invoke('fs:move', fromRelative, toRelative),
    stat: (relativePath) => ipcRenderer.invoke('fs:stat', relativePath),
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

  auth: {
    login: ({ id, password }) => ipcRenderer.invoke('auth:login', { id, password }),
    bindToken: (token) => ipcRenderer.invoke('auth:bindToken', token ?? ''),
    bindShareToken: (token) => ipcRenderer.invoke('auth:bindShareToken', token ?? ''),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  share: {
    getMap: () => ipcRenderer.invoke('share:getMap'),
    create: ({ path }) => ipcRenderer.invoke('share:create', { path }),
    revoke: ({ path }) => ipcRenderer.invoke('share:revoke', { path }),
    resolve: ({ token }) => ipcRenderer.invoke('share:resolve', { token }),
  },

  fileAccess: {
    getMap: () => ipcRenderer.invoke('fileAccess:getMap'),
    canEdit: (relativePath) => ipcRenderer.invoke('fileAccess:canEdit', relativePath),
    set: ({ path, visibility, viewRestricted }) =>
      ipcRenderer.invoke('fileAccess:set', { path, visibility, viewRestricted }),
  },

  trash: {
    getMap: () => ipcRenderer.invoke('trash:getMap'),
    move: (relativePath) => ipcRenderer.invoke('trash:move', { path: relativePath }),
    restore: (relativePath) => ipcRenderer.invoke('trash:restore', { path: relativePath }),
    empty: () => ipcRenderer.invoke('trash:empty'),
    deletePermanent: (relativePath) =>
      ipcRenderer.invoke('trash:deletePermanent', { path: relativePath }),
  },
});
