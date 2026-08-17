import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTempPath, resolvePortablePath } from './appContext.js';
import { getImageMimeType, isImageExtension } from '../shared/mediaTypes.js';
import { sevenZipMin } from './sevenZip.js';

/** @type {Map<string, { dir: string, pages: Array<{ name: string, absolutePath: string, mimeType: string }>, relativePath: string }>} */
const sessions = new Map();

const IMAGE_NAME_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|apng)$/i;

/**
 * @param {string} a
 * @param {string} b
 */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * @param {string} archivePath
 * @param {string} destDir
 */
async function unpackArchive(archivePath, destDir) {
  await sevenZipMin.unpack(archivePath, destDir);
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} relativePath
 */
export async function openComicArchive(relativePath) {
  const absoluteArchive = resolvePortablePath(relativePath);
  const sessionId = crypto.randomUUID();
  const dir = path.join(getTempPath(), 'nas4usb', 'comic-archive', sessionId);
  await fs.mkdir(dir, { recursive: true });

  try {
    await unpackArchive(absoluteArchive, dir);
    const files = await listFilesRecursive(dir);
    const pages = files
      .filter((abs) => IMAGE_NAME_RE.test(abs))
      .map((absolutePath) => {
        const name = path.relative(dir, absolutePath).split(path.sep).join('/');
        const ext = path.extname(absolutePath).slice(1).toLowerCase();
        return {
          name,
          absolutePath,
          mimeType: isImageExtension(ext) ? getImageMimeType(ext) : 'application/octet-stream',
        };
      })
      .sort((a, b) => naturalCompare(a.name, b.name));

    sessions.set(sessionId, { dir, pages, relativePath });
    return {
      sessionId,
      pageCount: pages.length,
      pages: pages.map((page, index) => ({ index, name: page.name, mimeType: page.mimeType })),
    };
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * @param {string} sessionId
 * @param {number} index
 */
export function getComicArchivePage(sessionId, index) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('만화 압축 세션을 찾을 수 없습니다.');
  }
  const page = session.pages[index];
  if (!page) {
    throw new Error('페이지를 찾을 수 없습니다.');
  }
  return page;
}

/**
 * @param {string} sessionId
 */
export async function closeComicArchive(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { closed: false };
  sessions.delete(sessionId);
  await fs.rm(session.dir, { recursive: true, force: true }).catch(() => {});
  return { closed: true };
}

/**
 * Close all sessions (app quit / tests).
 */
export async function closeAllComicArchives() {
  const ids = [...sessions.keys()];
  for (const id of ids) {
    await closeComicArchive(id);
  }
}
