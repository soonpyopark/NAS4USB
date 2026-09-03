/**
 * @param {string} relativePath
 * @param {AbortSignal} [signal]
 */
export function readDirWithRetry(relativePath, signal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return window.nas4usb.fs.readDir(relativePath ?? '.', { signal });
}
