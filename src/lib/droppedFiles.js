/**
 * @param {string} value
 */
function normalizeRel(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Chrome only returns a batch per `readEntries`; keep calling until empty.
 * @param {FileSystemDirectoryReader} reader
 * @returns {Promise<FileSystemEntry[]>}
 */
function readAllDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    /** @type {FileSystemEntry[]} */
    const all = [];
    const pull = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        pull();
      }, reject);
    };
    pull();
  });
}

/**
 * @param {File} file
 * @param {string} relativePath
 */
function withRelativePath(file, relativePath) {
  const rel = normalizeRel(relativePath) || file.name;
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: rel,
    });
    return file;
  } catch {
    const copy = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    Object.defineProperty(copy, 'webkitRelativePath', {
      configurable: true,
      value: rel,
    });
    return copy;
  }
}

/**
 * @param {FileSystemFileEntry} entry
 * @param {string} relativePath
 * @returns {Promise<File>}
 */
function fileFromEntry(entry, relativePath) {
  return new Promise((resolve, reject) => {
    entry.file((file) => {
      resolve(withRelativePath(file, relativePath));
    }, reject);
  });
}

/**
 * @param {FileSystemEntry} entry
 * @param {string} relativePath
 * @param {File[]} files
 * @param {string[]} emptyDirs
 */
async function walkEntry(entry, relativePath, files, emptyDirs) {
  const rel = normalizeRel(relativePath) || entry.name;
  if (entry.isFile) {
    try {
      files.push(await fileFromEntry(/** @type {FileSystemFileEntry} */ (entry), rel));
    } catch {
      // Offline / placeholder / unreadable items — skip instead of failing the drop.
    }
    return;
  }
  if (!entry.isDirectory) return;

  const children = await readAllDirectoryEntries(
    /** @type {FileSystemDirectoryEntry} */ (entry).createReader(),
  );
  if (children.length === 0) {
    emptyDirs.push(rel);
    return;
  }
  for (const child of children) {
    await walkEntry(child, rel ? `${rel}/${child.name}` : child.name, files, emptyDirs);
  }
}

/**
 * Folder drops must use `webkitGetAsEntry`. `dataTransfer.files` on Windows often
 * contains a directory File; reading it throws
 * "A requested file or directory could not be found…".
 *
 * @param {DataTransfer | null | undefined} dataTransfer
 * @returns {Promise<{ files: File[], emptyDirs: string[] }>}
 */
export async function collectDroppedPayload(dataTransfer) {
  /** @type {File[]} */
  const files = [];
  /** @type {string[]} */
  const emptyDirs = [];

  const items = Array.from(dataTransfer?.items ?? []);
  /** @type {FileSystemEntry[]} */
  const entries = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }

  if (entries.length > 0) {
    for (const entry of entries) {
      await walkEntry(entry, entry.name, files, emptyDirs);
    }
    return { files, emptyDirs };
  }

  return {
    files: Array.from(dataTransfer?.files ?? []),
    emptyDirs,
  };
}
