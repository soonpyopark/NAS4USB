/** Edit-time sidecar folder for a `.block` package, e.g. `NoName.block.assets`. */
export const BLOCK_ASSET_SIDECAR_SUFFIX = '.block.assets';

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isBlockAssetSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  const base = normalized.split('/').pop() ?? normalized;
  return base.endsWith(BLOCK_ASSET_SIDECAR_SUFFIX);
}

/**
 * @param {string} blockRelativePath e.g. `folder/NoName.block`
 */
export function getBlockAssetSidecarPath(blockRelativePath) {
  return `${normalizeRelativePath(blockRelativePath)}.assets`;
}

/**
 * @param {string} sidecarRelativePath e.g. `NoName.block.assets`
 * @returns {string | null}
 */
export function getBlockPathForAssetSidecar(sidecarRelativePath) {
  if (!isBlockAssetSidecarRelativePath(sidecarRelativePath)) return null;
  return normalizeRelativePath(sidecarRelativePath).slice(0, -'.assets'.length);
}

/**
 * @param {string} relativePath
 */
export function isBlockDocumentRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const base = normalized.split('/').pop() ?? normalized;
  return base.toLowerCase().endsWith('.block') && !isBlockAssetSidecarRelativePath(relativePath);
}

/**
 * @param {import('../src/types/nas4usb.d.ts').FsEntry[]} entries
 */
export function filterBlockAssetSidecarFromEntries(entries) {
  return entries.filter((entry) => !isBlockAssetSidecarRelativePath(entry.relativePath));
}
