/**
 * @param {string} currentPath
 * @param {string} name
 */
export function joinRelativePath(currentPath, name) {
  return currentPath === '.' ? name : `${currentPath}/${name}`;
}

/**
 * @param {string} relativePath
 */
export function getParentPath(relativePath) {
  if (relativePath === '.') return '.';
  const parts = relativePath.split('/');
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

/**
 * @param {string} relativePath
 */
export function getBaseName(relativePath) {
  return relativePath.split('/').pop() ?? relativePath;
}

/**
 * @param {Set<string>|string[]} existingNames
 * @param {string} desiredName
 */
export function resolveUniqueName(existingNames, desiredName) {
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames);
  if (!names.has(desiredName)) return desiredName;

  const extIndex = desiredName.lastIndexOf('.');
  const hasExt = extIndex > 0;
  const stem = hasExt ? desiredName.slice(0, extIndex) : desiredName;
  const ext = hasExt ? desiredName.slice(extIndex) : '';

  let counter = 1;
  while (names.has(`${stem} (${counter})${ext}`)) counter += 1;
  return `${stem} (${counter})${ext}`;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** @typedef {'name'|'modifiedAt'|'size'|'type'} SortField */
/** @typedef {'asc'|'desc'} SortDirection */

/**
 * @param {import('../types/educowork.d.ts').FsEntry[]} entries
 * @param {SortField} sortField
 * @param {SortDirection} sortDirection
 */
export function sortEntries(entries, sortField, sortDirection) {
  const factor = sortDirection === 'asc' ? 1 : -1;

  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    switch (sortField) {
      case 'modifiedAt':
        return factor * (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime());
      case 'size':
        return factor * ((a.size ?? 0) - (b.size ?? 0));
      case 'type':
        return factor * (a.extension ?? '').localeCompare(b.extension ?? '', 'ko');
      case 'name':
      default:
        return factor * a.name.localeCompare(b.name, 'ko');
    }
  });
}

/**
 * @param {import('../types/educowork.d.ts').FsEntry[]} entries
 * @param {string} query
 */
export function filterEntries(entries, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(normalized));
}
