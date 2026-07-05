/**
 * @param {string} fileName
 * @param {Blob} blob
 */
function triggerBrowserDownload(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export async function downloadFileEntry(entry) {
  if (entry.isDirectory) {
    throw new Error('폴더는 다운로드할 수 없습니다.');
  }

  const fileName = entry.name || entry.relativePath.split('/').pop() || 'download';
  const response = await fetch(`/api/fs/download?path=${encodeURIComponent(entry.relativePath)}`);

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
 */
export async function downloadFileEntries(entries) {
  const files = entries.filter((entry) => !entry.isDirectory);
  if (!files.length) {
    throw new Error('다운로드할 파일을 선택해 주세요.');
  }

  for (const entry of files) {
    await downloadFileEntry(entry);
  }
}
