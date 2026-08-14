/**
 * @param {string} [fileName]
 */
export function isOnenoteFileName(fileName) {
  return /\.(one|onepkg)$/i.test(String(fileName ?? ''));
}

/**
 * @param {string} [fileName]
 */
export function onenoteStem(fileName) {
  const base = String(fileName ?? '').split(/[/\\]/).pop() ?? '';
  return base.replace(/\.(one|onepkg)$/i, '').trim() || 'OneNote';
}
