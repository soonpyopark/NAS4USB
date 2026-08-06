/** Edit-time sidecar folder for a `.tiptap` package, e.g. `NoName.tiptap.assets`. */
export const TIPTAP_ASSET_SIDECAR_SUFFIX = '.tiptap.assets';

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isTiptapAssetSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  const base = normalized.split('/').pop() ?? normalized;
  return base.endsWith(TIPTAP_ASSET_SIDECAR_SUFFIX);
}

/**
 * @param {string} tiptapRelativePath e.g. `folder/NoName.tiptap`
 */
export function getTiptapAssetSidecarPath(tiptapRelativePath) {
  return `${normalizeRelativePath(tiptapRelativePath)}.assets`;
}

/**
 * @param {string} sidecarRelativePath e.g. `NoName.tiptap.assets`
 * @returns {string | null}
 */
export function getTiptapPathForAssetSidecar(sidecarRelativePath) {
  if (!isTiptapAssetSidecarRelativePath(sidecarRelativePath)) return null;
  return normalizeRelativePath(sidecarRelativePath).slice(0, -'.assets'.length);
}

/**
 * @param {string} relativePath
 */
export function isTiptapDocumentRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const base = normalized.split('/').pop() ?? normalized;
  return base.toLowerCase().endsWith('.tiptap') && !isTiptapAssetSidecarRelativePath(relativePath);
}

/**
 * @param {import('../src/types/nas4usb.d.ts').FsEntry[]} entries
 */
export function filterTiptapAssetSidecarFromEntries(entries) {
  return entries.filter((entry) => !isTiptapAssetSidecarRelativePath(entry.relativePath));
}
