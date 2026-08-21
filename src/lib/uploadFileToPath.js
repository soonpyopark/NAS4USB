import {
  LARGE_UPLOAD_THRESHOLD_BYTES,
  UPLOAD_CHUNK_BYTES,
} from '../../shared/chunkedUpload.js';
import { readFileAsBase64 } from './fsPaths.js';

const PART_RETRIES = 3;

/**
 * @param {File} file
 */
export function shouldUseChunkedUpload(file) {
  return Boolean(file && file.size >= LARGE_UPLOAD_THRESHOLD_BYTES);
}

/**
 * @param {string} relativePath
 * @param {File} file
 * @param {{ onByteProgress?: (info: { bytes: number, totalBytes: number }) => void }} [options]
 */
export async function uploadFileToPath(relativePath, file, options = {}) {
  const onByteProgress = options.onByteProgress;
  const totalBytes = file.size || 0;
  const localPath =
    (typeof window.nas4usb.fs.getPathForFile === 'function'
      ? window.nas4usb.fs.getPathForFile(file)
      : '') || (typeof file.path === 'string' ? file.path : '');

  if (localPath && typeof window.nas4usb.fs.importLocalFile === 'function') {
    onByteProgress?.({ bytes: 0, totalBytes });
    await window.nas4usb.fs.importLocalFile({ path: relativePath, sourceAbsolute: localPath });
    onByteProgress?.({ bytes: totalBytes, totalBytes });
    return true;
  }

  if (!shouldUseChunkedUpload(file) || typeof window.nas4usb.fs.uploadInit !== 'function') {
    const base64 = await readFileAsBase64(file);
    await window.nas4usb.fs.writeFile(relativePath, base64);
    onByteProgress?.({ bytes: totalBytes, totalBytes });
    return true;
  }

  const started = await window.nas4usb.fs.uploadInit({ path: relativePath, size: totalBytes });
  const uploadId = started.uploadId;
  let offset = Number(started.received) || 0;
  onByteProgress?.({ bytes: offset, totalBytes });

  try {
    while (offset < totalBytes) {
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, totalBytes);
      const chunk = file.slice(offset, end);
      const bytes = await chunk.arrayBuffer();
      const result = await writePartWithRetry(uploadId, offset, bytes);
      offset = Number(result.received) || end;
      onByteProgress?.({ bytes: offset, totalBytes });
    }
    await window.nas4usb.fs.uploadCommit(uploadId);
  } catch (error) {
    try {
      await window.nas4usb.fs.uploadAbort(uploadId);
    } catch {
      // keep the original error
    }
    throw error;
  }

  return true;
}

/**
 * @param {string} uploadId
 * @param {number} offset
 * @param {ArrayBuffer} bytes
 */
async function writePartWithRetry(uploadId, offset, bytes) {
  let lastError = null;
  for (let attempt = 1; attempt <= PART_RETRIES; attempt += 1) {
    try {
      return await window.nas4usb.fs.uploadPart({ uploadId, offset, bytes });
    } catch (error) {
      lastError = error;
      if (attempt >= PART_RETRIES) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('업로드 조각을 보내지 못했습니다.');
}
