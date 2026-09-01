import { getParentPath } from './fsPaths.js';
import { HOMES_FOLDER, isHomesContainerPath } from './memberHomes.js';

/**
 * @param {string} fileName
 */
function extensionOf(fileName) {
  const name = String(fileName ?? '');
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : null;
}

/**
 * @param {{ relativePath?: string, fileName?: string, size?: number, modifiedAt?: string }} hit
 */
export function fsEntryFromDocHit(hit) {
  const relativePath = String(hit?.relativePath || '');
  const fileName = String(hit?.fileName || relativePath.split('/').pop() || '');
  const extension = extensionOf(fileName);
  const modifiedAt = typeof hit?.modifiedAt === 'string' ? hit.modifiedAt : '';
  return {
    name: fileName,
    relativePath,
    isDirectory: false,
    extension,
    size: Number(hit?.size) || 0,
    modifiedAt,
    searchLocation: String(hit?.location ?? ''),
    searchSnippet: String(hit?.content ?? ''),
    locationJson: hit?.locationJson,
  };
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} nameEntries
 * @param {Array<{ relativePath: string, fileName: string, location: string, content: string, docType: string, folderPath: string, size?: number, modifiedAt?: string }>} contentHits
 */
export function mergeNameAndDocHits(nameEntries, contentHits) {
  const byPath = new Map();

  for (const entry of nameEntries ?? []) {
    byPath.set(entry.relativePath, { entry, nameMatch: true, hits: [] });
  }

  for (const hit of contentHits ?? []) {
    const path = hit.relativePath;
    if (!path) continue;
    const snippet = {
      location: hit.location,
      locationJson: hit.locationJson,
      content: hit.content,
      docType: hit.docType,
      folderPath: hit.folderPath,
    };
    const existing = byPath.get(path);
    if (existing) {
      existing.hits.push(snippet);
      continue;
    }
    byPath.set(path, {
      entry: fsEntryFromDocHit(hit),
      nameMatch: false,
      hits: [snippet],
    });
  }

  return [...byPath.values()];
}

/**
 * Unique file paths from index hits that belong to the folder currently shown.
 * @param {Array<{ relativePath: string }>} contentHits
 * @param {string} currentPath
 * @param {string | null} homePath
 */
export function indexHitsInCurrentFolder(contentHits, currentPath, homePath) {
  const matched = new Set();
  for (const hit of contentHits ?? []) {
    const parent = getParentPath(hit.relativePath);
    if (parent === currentPath) {
      matched.add(hit.relativePath);
      continue;
    }
    if (isHomesContainerPath(currentPath) && homePath && parent === homePath) {
      matched.add(hit.relativePath);
    }
    if (currentPath === HOMES_FOLDER && homePath && parent === homePath) {
      matched.add(hit.relativePath);
    }
  }
  return matched;
}
