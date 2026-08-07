/**
 * @typedef {Object} Nas4usbPaths
 * @property {string} appPath
 * @property {string} dataRoot
 * @property {string} tempPath
 * @property {boolean} isDev
 */

/**
 * @typedef {Object} Nas4usbSyncInfo
 * @property {number} port
 * @property {string[]} addresses
 */

/**
 * @typedef {Object} FsEntry
 * @property {string} name
 * @property {string} relativePath
 * @property {boolean} isDirectory
 * @property {number} size
 * @property {string} modifiedAt
 * @property {string|null} extension
 */

/**
 * @typedef {Object} FsStatInfo
 * @property {string} name
 * @property {string} relativePath
 * @property {boolean} isDirectory
 * @property {number} size
 * @property {string} createdAt
 * @property {string} modifiedAt
 * @property {string|null} extension
 */

/**
 * @typedef {Object} WorkspaceSession
 * @property {string} sessionId
 * @property {string} fileName
 */

/** @global */
window.nas4usb = {
  __source: 'electron',
  getPaths: () => {},
  getSyncInfo: () => {},
  checkForUpdates: () => {},
  openExternal: (url) => {},
  dialog: {
    pickDirectory: (options) => {},
  },
  subscribeFsChanged: (callback) => {},
  fs: {
    readDir: (relativePath) => {},
    mkdir: (relativePath) => {},
    delete: (relativePath) => {},
    rename: (fromRelative, toRelative) => {},
    exists: (relativePath) => {},
    readFile: (relativePath) => {},
    writeFile: (relativePath, base64) => {},
    copy: (fromRelative, toRelative) => {},
    move: (fromRelative, toRelative) => {},
    stat: (relativePath) => {},
    writeFileAbsolute: (params) => {},
    openPath: (relativePath) => {},
  },
  workspace: {
    open: (relativePath) => {},
    read: (sessionId) => {},
    write: (sessionId, base64) => {},
    commit: (sessionId) => {},
    close: (sessionId) => {},
  },
  editors: {
    getStatus: () => {},
    update: () => {},
  },
  auth: {
    login: ({ id, password }) => {},
  },
  share: {
    getMap: () => {},
    create: ({ path, mode }) => {},
    setMode: ({ path, mode }) => {},
    revoke: ({ path }) => {},
    resolve: ({ token }) => {},
  },
  favorites: {
    getMap: () => {},
    listEntries: () => {},
    set: ({ path, favorited }) => {},
  },
  trash: {
    getMap: () => {},
    move: (relativePath) => {},
    restore: (relativePath) => {},
    empty: () => {},
    deletePermanent: (relativePath) => {},
  },
  history: {
    list: (relativePath, shareToken) => {},
    read: (relativePath, entryId, shareToken) => {},
    readSidecar: (relativePath, entryId, shareToken) => {},
    deleteEntry: (relativePath, entryId, shareToken) => {},
    restore: (relativePath, entryId, shareToken) => {},
  },
  settings: {
    get: () => {},
    getGuestPermissions: () => {},
    update: (patch) => {},
  },
  server: {
    getInfo: () => {},
    applyConfig: (patch) => {},
    allowFirewall: (port) => {},
    removeFirewall: (port) => {},
  },
  members: {
    list: () => {},
    export: () => {},
    save: (payload) => {},
  },
};

export {};
