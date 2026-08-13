import { getShareTokenFromUrl } from './shareAccess.js';
import { getStoredAdminToken } from './nas4usbClient.js';
import { triggerBrowserDownload } from './browserDownload.js';

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export async function downloadFileEntry(entry) {
  if (entry.isDirectory) {
    throw new Error('폴더는 다운로드할 수 없습니다.');
  }

  const fileName = entry.name || entry.relativePath.split('/').pop() || 'download';
  const params = new URLSearchParams({ path: entry.relativePath });
  const shareToken = getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  const adminToken = getStoredAdminToken();
  if (adminToken) params.set('token', adminToken);

  const response = await fetch(`/api/fs/download?${params.toString()}`);

  if (!response.ok) {
    let message = '다운로드에 실패했습니다.';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  triggerBrowserDownload(fileName, blob);
}

/**
 * @param {Array<{ relativePath: string, name?: string, isDirectory?: boolean }>} entries
 * @param {{ onProgress?: (info: { current: number, total: number, fileName: string }) => void }} [options]
 */
export async function downloadFileEntries(entries, options = {}) {
  const files = entries.filter((entry) => !entry.isDirectory);
  if (!files.length) {
    throw new Error('다운로드할 파일을 선택해 주세요.');
  }

  const total = files.length;
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index];
    options.onProgress?.({
      current: index + 1,
      total,
      fileName: entry.name || entry.relativePath.split('/').pop() || 'download',
    });
    await downloadFileEntry(entry);
  }
}
