/** Edit-time sidecar folder for a `.tiptap` package, e.g. `NoName.tiptap.assets`. */
export const TIPTAP_ASSET_SIDECAR_SUFFIX = '.tiptap.assets';
const TIPTAP_SEC_ASSET_SIDECAR_SUFFIX = '.tiptap.sec.assets';

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
function stripTrailingSecSuffix(relativePath) {
  return relativePath.replace(/\.sec$/i, '');
}

/**
 * @param {string} relativePath
 */
export function isTiptapAssetSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  const base = (normalized.split('/').pop() ?? normalized).toLowerCase();
  return base.endsWith(TIPTAP_ASSET_SIDECAR_SUFFIX) || base.endsWith(TIPTAP_SEC_ASSET_SIDECAR_SUFFIX);
}

/**
 * Always `{name}.tiptap.assets`, including when the document is `{name}.tiptap.sec`.
 * @param {string} tiptapRelativePath e.g. `folder/NoName.tiptap` or `folder/NoName.tiptap.sec`
 */
export function getTiptapAssetSidecarPath(tiptapRelativePath) {
  return `${stripTrailingSecSuffix(normalizeRelativePath(tiptapRelativePath))}.assets`;
}

/**
 * Leftover folder from before sidecar paths ignored `.sec`.
 * @param {string} tiptapRelativePath
 * @returns {string | null}
 */
export function getLegacySecTiptapAssetSidecarPath(tiptapRelativePath) {
  const normalized = normalizeRelativePath(tiptapRelativePath);
  if (!normalized.toLowerCase().endsWith('.tiptap.sec')) return null;
  const legacy = `${normalized}.assets`;
  return legacy === getTiptapAssetSidecarPath(normalized) ? null : legacy;
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
  const lower = base.toLowerCase();
  return (
    (lower.endsWith('.tiptap') || lower.endsWith('.tiptap.sec')) &&
    !isTiptapAssetSidecarRelativePath(relativePath)
  );
}

/**
 * @param {import('../src/types/nas4usb.d.ts').FsEntry[]} entries
 */
export function filterTiptapAssetSidecarFromEntries(entries) {
  return entries.filter((entry) => !isTiptapAssetSidecarRelativePath(entry.relativePath));
}
