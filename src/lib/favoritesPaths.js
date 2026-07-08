import { FAVORITES_FOLDER, isFavoritesRelativePath } from '../../shared/constants.js';

export { FAVORITES_FOLDER };

/**
 * @param {string} relativePath
 */
export function isFavoritesPath(relativePath) {
  return isFavoritesRelativePath(relativePath);
}

/**
 * @param {string} relativePath
 */
export function isFavoritesRoot(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/') === FAVORITES_FOLDER;
}
