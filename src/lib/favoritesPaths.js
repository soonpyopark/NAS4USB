import {
  FAVORITES_FILES_FOLDER,
  FAVORITES_FOLDER,
  FAVORITES_FOLDERS_FOLDER,
  favoritesViewKind,
  isFavoritesRelativePath,
} from '../../shared/constants.js';

export { FAVORITES_FOLDER, FAVORITES_FILES_FOLDER, FAVORITES_FOLDERS_FOLDER, favoritesViewKind };

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
