import {
  FAVORITES_FILES_FOLDER,
  FAVORITES_FOLDER,
  FAVORITES_FOLDERS_FOLDER,
  favoritesViewKind,
  isFavoritesRelativePath,
} from '../../shared/constants.js';
import { HOMES_FOLDER } from '../../shared/memberHomes.js';
import { displayEntryName, getParentPath } from './fsPaths.js';
import { formatBreadcrumbSegment } from './trashPaths.js';

export { FAVORITES_FOLDER, FAVORITES_FILES_FOLDER, FAVORITES_FOLDERS_FOLDER, favoritesViewKind };

/**
 * One-line path for a favorite entry, including the item itself.
 * Hides `개인폴더/{loginId}` the same way breadcrumbs do.
 * @param {string} relativePath
 * @param {{
 *   includeSelf?: boolean,
 *   isDirectory?: boolean,
 *   externalFolders?: import('../../shared/externalFolders.js').ExternalFolderMount[],
 * }} [options]
 */
export function favoriteAncestorLabel(relativePath, options) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/');
  const pathForSegments = options?.includeSelf ? normalized : getParentPath(normalized);
  if (!pathForSegments || pathForSegments === '.') return '';
  const segments = pathForSegments.split('/').filter(Boolean);
  const labels = [];
  let acc = '';
  for (let index = 0; index < segments.length; index += 1) {
    acc = acc ? `${acc}/${segments[index]}` : segments[index];
    if (segments[0] === HOMES_FOLDER && index === 1) continue;
    const isLast = index === segments.length - 1;
    const label = formatBreadcrumbSegment(segments[index], {
      path: acc,
      externalFolders: options?.externalFolders,
    });
    labels.push(
      isLast && options?.includeSelf && options?.isDirectory === false
        ? displayEntryName(label)
        : label,
    );
  }
  return labels.join(' / ');
}

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
