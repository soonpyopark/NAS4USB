import path from 'node:path';

/** WhiteBoard4Share version vendored in this repo. */
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

/** Fixed copy checked into NAS4USB (replaces .cache/wb4s-src). */
export function getWb4sVendorRoot(root) {
  return path.join(root, 'vendor', 'whiteboard4share');
}

/** @deprecated use getWb4sVendorRoot */
export function getWb4sCacheSrc(root) {
  return getWb4sVendorRoot(root);
}

export function getWb4sEngineSrc(root) {
  return path.join(getWb4sVendorRoot(root), 'src');
}

/** Temp dir for upstream merge/diff (gitignored under .cache). */
export function getWb4sMergeScratch(root) {
  return path.join(root, '.cache', 'wb4s-upstream-merge');
}
