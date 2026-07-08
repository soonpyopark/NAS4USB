import fs from 'node:fs/promises';
import path from 'node:path';
import { TRASH_FOLDER } from '../shared/constants.js';
import { assertRenamePreservesExtension } from '../shared/entryNames.js';
import { resolvePortablePath } from './appContext.js';

/**
 * @param {string} [relativePath]
 */
function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '.').replace(/\\/g, '/');
}

/**
 * @param {unknown} error
 */
function toUserFsError(error) {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      return new Error('파일이 다른 프로그램에서 사용 중이거나 접근 권한이 없습니다.');
    }
    if (error.code === 'ENOENT') {
      return new Error('파일 또는 폴더를 찾을 수 없습니다.');
    }
  }

  if (error instanceof Error) return error;
  return new Error('파일 시스템 작업에 실패했습니다.');
}

/**
 * @param {string} parentRelative
 * @param {string} entryName
 */
function joinRelativePath(parentRelative, entryName) {
  const parent = normalizeRelativePath(parentRelative);
  if (parent === '.') return entryName;
  return `${parent}/${entryName}`;
}

/**
 * @param {string} relativePath
 */
async function resolveExistingRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const parent = path.posix.dirname(normalized);
  const baseName = path.posix.basename(normalized);
  const parentRelative = parent === '.' || parent === '' ? '.' : parent;

  let parentAbsolute;
  try {
    parentAbsolute = resolvePortablePath(parentRelative);
    await fs.access(parentAbsolute);
  } catch {
    return null;
  }

  const names = await fs.readdir(parentAbsolute);
  const targetNfc = baseName.normalize('NFC');
  const targetNfd = baseName.normalize('NFD');

  for (const name of names) {
    if (name === baseName || name.normalize('NFC') === targetNfc || name.normalize('NFD') === targetNfd) {
      return joinRelativePath(parentRelative, name);
    }
  }

  return null;
}

/**
 * @param {string} relativePath
 */
async function resolveExistingAbsolutePathWithFallback(relativePath) {
  const absolute = resolvePortablePath(relativePath);
  try {
    await fs.access(absolute);
    return absolute;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      const resolved = await resolveExistingRelativePath(relativePath);
      if (resolved) {
        return resolvePortablePath(resolved);
      }
    }
    throw toUserFsError(error);
  }
}

function assertNotTrashTarget(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === TRASH_FOLDER || normalized.startsWith(`${TRASH_FOLDER}/`)) {
    throw new Error('휴지통에는 파일을 추가할 수 없습니다.');
  }
}

export async function readDir(relativePath = '.') {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = resolvePortablePath(relativePath);

  try {
    await fs.access(absolute);
  } catch (error) {
    if (normalized === TRASH_FOLDER) {
      await fs.mkdir(absolute, { recursive: true });
      return [];
    }
    throw toUserFsError(error);
  }

  const entries = await fs.readdir(absolute, { withFileTypes: true });

  return Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const entryRelative = joinRelativePath(relativePath, entry.name);
        const entryAbsolute = path.join(absolute, entry.name);

        try {
          const stat = await fs.stat(entryAbsolute);
          return {
            name: entry.name,
            relativePath: entryRelative,
            isDirectory: entry.isDirectory(),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            extension: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase(),
          };
        } catch (error) {
          return {
            name: entry.name,
            relativePath: entryRelative,
            isDirectory: entry.isDirectory(),
            size: 0,
            modifiedAt: new Date(0).toISOString(),
            extension: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase(),
            inaccessible: true,
            statError: error instanceof Error ? error.message : 'stat failed',
          };
        }
      }),
  );
}

export async function mkdir(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.startsWith(`${TRASH_FOLDER}/`)) {
    throw new Error('휴지통에는 파일을 추가할 수 없습니다.');
  }
  await fs.mkdir(resolvePortablePath(relativePath), { recursive: true });
  return true;
}

export async function deletePath(relativePath) {
  const { purgeYjsRoomsForPathTree } = await import('./yjsRoomTree.js');
  await purgeYjsRoomsForPathTree(relativePath);

  const absolute = await resolveExistingAbsolutePathWithFallback(relativePath);
  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    throw toUserFsError(error);
  }

  try {
    if (stat.isDirectory()) {
      await fs.rm(absolute, { recursive: true });
    } else {
      await fs.unlink(absolute);
    }
  } catch (error) {
    throw toUserFsError(error);
  }
  return true;
}

export async function renamePath(fromRelative, toRelative) {
  const fromName = path.basename(normalizeRelativePath(fromRelative));
  const toName = path.basename(normalizeRelativePath(toRelative));
  const stat = await statPath(fromRelative);
  assertRenamePreservesExtension(fromName, toName, stat.isDirectory);
  await fs.rename(resolvePortablePath(fromRelative), resolvePortablePath(toRelative));
  return true;
}

export async function pathExists(relativePath) {
  try {
    await fs.access(resolvePortablePath(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function readFileBase64(relativePath) {
  const absolute = resolvePortablePath(relativePath);
  const buffer = await fs.readFile(absolute);
  return buffer.toString('base64');
}

export async function writeFileBase64(relativePath, base64 = '') {
  assertNotTrashTarget(relativePath);
  const absolute = resolvePortablePath(relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const existed = await pathExists(relativePath);
  await fs.writeFile(absolute, Buffer.from(base64, 'base64'));
  if (!existed) {
    const { purgeYjsRoomForPath } = await import('./yjsRoom.js');
    purgeYjsRoomForPath(relativePath);
  }
  return true;
}

export async function copyPath(fromRelative, toRelative) {
  await fs.cp(resolvePortablePath(fromRelative), resolvePortablePath(toRelative), { recursive: true });
  return true;
}

export async function movePath(fromRelative, toRelative) {
  const from = resolvePortablePath(fromRelative);
  const destination = resolvePortablePath(toRelative);
  await fs.mkdir(path.dirname(destination), { recursive: true });

  try {
    await fs.rename(from, destination);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'EPERM' || code === 'EACCES' || code === 'EXDEV') {
      await fs.cp(from, destination, { recursive: true, force: true });
      await fs.rm(from, { recursive: true, force: true });
    } else {
      throw toUserFsError(error);
    }
  }
  return true;
}

export async function statPath(relativePath) {
  const absolute = await resolveExistingAbsolutePathWithFallback(relativePath);
  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    throw toUserFsError(error);
  }

  const resolvedRelative = normalizeRelativePath(relativePath);
  return {
    name: path.basename(absolute),
    relativePath: resolvedRelative,
    isDirectory: stat.isDirectory(),
    size: stat.size,
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    extension: stat.isDirectory() ? null : path.extname(absolute).slice(1).toLowerCase(),
  };
}

export async function readFileBuffer(relativePath) {
  const absolute = resolvePortablePath(relativePath);
  return fs.readFile(absolute);
}
