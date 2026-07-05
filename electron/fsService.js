import fs from 'node:fs/promises';
import path from 'node:path';
import { TRASH_FOLDER } from '../shared/constants.js';
import { resolvePortablePath } from './appContext.js';

/**
 * @param {string} [relativePath]
 */
function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '.').replace(/\\/g, '/');
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
    throw error;
  }

  const entries = await fs.readdir(absolute, { withFileTypes: true });

  return Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const entryAbsolute = path.join(absolute, entry.name);
        const stat = await fs.stat(entryAbsolute);
        return {
          name: entry.name,
          relativePath: path.join(relativePath, entry.name).replace(/\\/g, '/'),
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          extension: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase(),
        };
      }),
  );
}

export async function mkdir(relativePath) {
  await fs.mkdir(resolvePortablePath(relativePath), { recursive: true });
  return true;
}

export async function deletePath(relativePath) {
  const absolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) {
    await fs.rm(absolute, { recursive: true });
  } else {
    await fs.unlink(absolute);
  }
  return true;
}

export async function renamePath(fromRelative, toRelative) {
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
  const absolute = resolvePortablePath(relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, Buffer.from(base64, 'base64'));
  return true;
}

export async function copyPath(fromRelative, toRelative) {
  await fs.cp(resolvePortablePath(fromRelative), resolvePortablePath(toRelative), { recursive: true });
  return true;
}

export async function movePath(fromRelative, toRelative) {
  const destination = resolvePortablePath(toRelative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(resolvePortablePath(fromRelative), destination);
  return true;
}

export async function statPath(relativePath) {
  const absolute = resolvePortablePath(relativePath);
  const stat = await fs.stat(absolute);
  return {
    name: path.basename(absolute),
    relativePath,
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
