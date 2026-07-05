import path from 'node:path';

/** WhiteBoard4Share version bundled into EduCowork. */
export const WB4S_UPSTREAM_VERSION = '1.0.3';

export const WB4S_REPO = 'https://github.com/soonpyopark/WhiteBoard4Share.git';

/** @type {readonly string[]} */
export const WB4S_SYNC_EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'exe',
  '.git',
  'electron-dist',
  'electron',
];

export function getWb4sSiblingSrc(root) {
  return path.resolve(root, '..', `WhiteBoard4Share v${WB4S_UPSTREAM_VERSION}`);
}

export function getWb4sCacheSrc(root) {
  return path.join(root, '.cache', 'wb4s-src');
}
