import { isTrashPath } from './trashPaths.js';

const TRASH_OPEN_MESSAGE = '휴지통에 있는 파일은 복원한 뒤 열어 주세요.';
const MISSING_OPEN_MESSAGE = '파일을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.';

/**
 * @param {{ relativePath: string, isDirectory?: boolean }} entry
 * @param {{ onMissing?: () => void }} [options]
 * @returns {Promise<boolean>}
 */
export async function guardOpenFileEntry(entry, { onMissing } = {}) {
  if (entry.isDirectory) return true;

  if (isTrashPath(entry.relativePath)) {
    window.alert(TRASH_OPEN_MESSAGE);
    return false;
  }

  try {
    await window.nas4usb.fs.stat(entry.relativePath);
    return true;
  } catch {
    window.alert(MISSING_OPEN_MESSAGE);
    onMissing?.();
    return false;
  }
}
