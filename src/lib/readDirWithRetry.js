import { retryAsync } from './retryAsync.js';

/** readDir — tolerate brief server restarts / LAN glitches. */
const FS_READ_DIR_RETRY = { retries: 4, delayMs: 600 };

/**
 * @param {string} relativePath
 */
export function readDirWithRetry(relativePath) {
  return retryAsync(
    () => window.educowork.fs.readDir(relativePath ?? '.'),
    FS_READ_DIR_RETRY,
  );
}
