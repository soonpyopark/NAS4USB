const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('educowork', {
  __source: 'electron',
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getSyncInfo: () => ipcRenderer.invoke('sync:getInfo'),

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
    open: (relativePath) => ipcRenderer.invoke('workspace:open', relativePath),
    read: (sessionId) => ipcRenderer.invoke('workspace:read', sessionId),
    write: (sessionId, base64) => ipcRenderer.invoke('workspace:write', sessionId, base64),
    commit: (sessionId) => ipcRenderer.invoke('workspace:commit', sessionId),
    rename: (sessionId, relativePath) =>
      ipcRenderer.invoke('workspace:rename', sessionId, relativePath),
    close: (sessionId) => ipcRenderer.invoke('workspace:close', sessionId),
  },

  editors: {
    getStatus: () => ipcRenderer.invoke('editors:getStatus'),
    update: () => ipcRenderer.invoke('editors:update'),
  },
});
