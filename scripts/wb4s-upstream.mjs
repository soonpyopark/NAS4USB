import path from 'node:path';

/** WhiteBoard4Share version bundled into NAS4USB. */
export const WB4S_UPSTREAM_VERSION = '1.0.4';

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

/** Runtime / build engine tree (gitignored under .cache/). */
export function getWb4sCacheSrc(root) {
  return path.join(root, '.cache', 'wb4s-src');
}

/** @deprecated use getWb4sCacheSrc */
export function getWb4sVendorRoot(root) {
  return path.join(root, 'vendor', 'whiteboard4share');
}

export function getWb4sEngineSrc(root) {
  return path.join(getWb4sCacheSrc(root), 'src');
}

export function getWb4sOverlayDir(root) {
  return path.join(root, 'vendor', 'wb4s-nas4usb-overlay');
}

export function getWb4sLocalUpdatePackage(root) {
  return path.join(root, 'lib', 'updates', 'wb4s');
}

/** Temp dir for upstream merge/diff (gitignored under .cache). */
export function getWb4sMergeScratch(root) {
  return path.join(root, '.cache', 'wb4s-upstream-merge');
}
