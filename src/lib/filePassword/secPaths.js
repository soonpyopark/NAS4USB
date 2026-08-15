export const SEC_SUFFIX = '.sec';

/**
 * @param {string | null | undefined} nameOrPath
 */
export function isSecFileName(nameOrPath) {
  const base = String(nameOrPath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  return base.toLowerCase().endsWith(SEC_SUFFIX) && base.length > SEC_SUFFIX.length;
}

/**
 * @param {string} relativePath
 */
export function stripSecSuffix(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (!isSecFileName(normalized)) return normalized;
  return normalized.slice(0, -SEC_SUFFIX.length);
}

/**
 * @param {string} relativePath
 */
export function toSecPath(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  if (isSecFileName(normalized)) return normalized;
  return `${normalized}${SEC_SUFFIX}`;
}

/**
 * @param {string | null | undefined} nameOrPath
 */
export function innerExtensionOf(nameOrPath) {
  const inner = stripSecSuffix(String(nameOrPath ?? '').replace(/\\/g, '/').split('/').pop() ?? '');
  const index = inner.lastIndexOf('.');
  if (index <= 0) return '';
  return inner.slice(index + 1).toLowerCase();
}

/**
 * @param {string | null | undefined} nameOrPath
 */
export function innerFileNameOf(nameOrPath) {
  const base = String(nameOrPath ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  return isSecFileName(base) ? base.slice(0, -SEC_SUFFIX.length) : base;
}

/**
 * Viewer/media extension, ignoring a trailing `.sec`.
 *
 * @param {{ name?: string, relativePath?: string, extension?: string } | string | null | undefined} entryOrName
 */
export function entryExtensionOf(entryOrName) {
  if (!entryOrName) return '';
  if (typeof entryOrName === 'string') {
    return innerExtensionOf(entryOrName);
  }
  return (
    innerExtensionOf(entryOrName.name || entryOrName.relativePath) ||
    String(entryOrName.extension || '')
      .replace(/^\./, '')
      .toLowerCase()
  );
}
