import * as fsService from './fsService.js';
import { purgeYjsRoomForPath } from './yjsRoom.js';

/**
 * @param {string} dirRelative
 */
async function collectFilePaths(dirRelative) {
  /** @type {string[]} */
  const paths = [];

  async function walk(relativePath) {
    const entries = await fsService.readDir(relativePath);
    for (const entry of entries) {
      if (entry.isDirectory) {
        await walk(entry.relativePath);
      } else {
        paths.push(entry.relativePath);
      }
    }
  }

  await walk(dirRelative);
  return paths;
}

/**
 * Purge Y.js rooms for a file or every file under a directory.
 * @param {string} relativePath
 */
export async function purgeYjsRoomsForPathTree(relativePath) {
  try {
    const stat = await fsService.statPath(relativePath);
    if (!stat.isDirectory) {
      purgeYjsRoomForPath(relativePath);
      return;
    }

    const paths = await collectFilePaths(relativePath);
    for (const filePath of paths) {
      purgeYjsRoomForPath(filePath);
    }
  } catch {
    purgeYjsRoomForPath(relativePath);
  }
}
