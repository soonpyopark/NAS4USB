import { filterFortuneSidecarFromEntries } from '../../shared/fortuneSheetSidecar.js';
import { filterPdfViewerSidecarFromEntries } from '../../shared/pdfViewerSidecar.js';
import { filterTiptapAssetSidecarFromEntries } from '../../shared/tiptapAssetPaths.js';
import { sortEntriesByFolderOrder } from './folderOrder.js';
import { HOMES_FOLDER } from './memberHomes.js';
import { getBaseName, getParentPath } from './fsPaths.js';
import { readDirWithRetry } from './readDirWithRetry.js';
import { filterTrashFromEntries, formatBreadcrumbSegment } from './trashPaths.js';

export const FOLDER_PREVIEW_LIMIT = 80;

/**
 * @param {string} relativePath
 * @param {Record<string, string[]> | null | undefined} folderOrderMap
 */
export async function listFolderPreviewEntries(relativePath, folderOrderMap) {
  const result = await readDirWithRetry(relativePath);
  const filtered = filterPdfViewerSidecarFromEntries(
    filterFortuneSidecarFromEntries(
      filterTiptapAssetSidecarFromEntries(filterTrashFromEntries(result, relativePath)),
    ),
  );
  const sorted = sortEntriesByFolderOrder(filtered, relativePath, folderOrderMap);
  let folders = 0;
  let files = 0;
  for (const entry of sorted) {
    if (entry.isDirectory) folders += 1;
    else files += 1;
  }
  return {
    entries: sorted.slice(0, FOLDER_PREVIEW_LIMIT),
    truncated: sorted.length > FOLDER_PREVIEW_LIMIT,
    folders,
    files,
    total: sorted.length,
  };
}

/**
 * @param {string | null | undefined} _anchorPath
 * @param {string} folderPath
 * @param {import('../../shared/externalFolders.js').ExternalFolderMount[]} [externalFolders]
 */
export function folderPreviewCrumbs(_anchorPath, folderPath, externalFolders) {
  const current = folderPath || '.';
  if (!current || current === '.') {
    return [{ path: '.', name: '워크스페이스' }];
  }
  const segments = current.split('/').filter(Boolean);
  const skipHomeId = segments[0] === HOMES_FOLDER && segments.length >= 2;
  /** @type {{ path: string, name: string }[]} */
  const crumbs = [];
  let acc = '';
  segments.forEach((segment, index) => {
    acc = acc ? `${acc}/${segment}` : segment;
    if (skipHomeId && index === 1) return;
    crumbs.push({
      path: acc,
      name: formatBreadcrumbSegment(segment, { path: acc, externalFolders }),
    });
  });
  return crumbs.length ? crumbs : [{ path: current, name: getBaseName(current) || '폴더' }];
}

/**
 * @param {string} previewPath
 * @param {string | null | undefined} [_anchorPath]
 */
export function folderPreviewParentPath(previewPath, _anchorPath) {
  const parent = getParentPath(previewPath);
  if (!parent || parent === previewPath || parent === '.') return null;
  return parent;
}
