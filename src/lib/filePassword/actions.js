import { showAppAlert } from '../nativeDialog.js';
import { lockFileWithPassword, unlockFileWithPassword } from './io.js';
import { decryptSecBase64 } from './aes256.js';
import { promptFilePassword } from './prompts.js';
import { rememberFilePassword } from './session.js';
import { isSecFileName } from './secPaths.js';

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export function canSetFilePassword(entry) {
  return Boolean(entry && !entry.isDirectory && !isSecFileName(entry.relativePath));
}

/**
 * @param {{ relativePath: string, name?: string, isDirectory?: boolean }} entry
 */
export function canRemoveFilePassword(entry) {
  return Boolean(entry && !entry.isDirectory && isSecFileName(entry.relativePath));
}

/**
 * @param {{ relativePath: string, name?: string }} entry
 */
export async function verifySecPassword(entry) {
  const password = await promptFilePassword({
    mode: 'unlock',
    fileName: entry.name || entry.relativePath.split('/').pop(),
  });
  if (!password) return null;
  const raw = await window.nas4usb.fs.readFile(entry.relativePath);
  await decryptSecBase64(raw, password);
  rememberFilePassword(entry.relativePath, password);
  return password;
}

/**
 * @param {Array<{ relativePath: string, name?: string, isDirectory?: boolean }>} entries
 * @returns {Promise<Array<{ from: string, to: string }>>}
 */
export async function setPasswordOnEntries(entries) {
  const targets = entries.filter(canSetFilePassword);
  if (!targets.length) {
    await showAppAlert({ title: '비밀번호 설정', body: '비밀번호를 설정할 파일을 선택해 주세요.' });
    return [];
  }
  const password = await promptFilePassword({
    mode: 'set',
    fileName: targets[0].name || targets[0].relativePath.split('/').pop(),
    body:
      targets.length > 1
        ? `${targets.length}개 파일에 같은 비밀번호를 설정합니다. 잊으면 복구할 수 없습니다.`
        : undefined,
  });
  if (!password) return [];

  /** @type {Array<{ from: string, to: string }>} */
  const locked = [];
  const errors = [];
  for (const entry of targets) {
    try {
      const to = await lockFileWithPassword(entry.relativePath, password);
      locked.push({ from: entry.relativePath, to });
    } catch (err) {
      errors.push(`${entry.name || entry.relativePath}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (errors.length) {
    await showAppAlert({
      title: '비밀번호 설정',
      body: errors.join('\n'),
    });
  }
  return locked;
}

/**
 * @param {Array<{ relativePath: string, name?: string, isDirectory?: boolean }>} entries
 * @returns {Promise<Array<{ from: string, to: string }>>}
 */
export async function removePasswordFromEntries(entries) {
  const targets = entries.filter(canRemoveFilePassword);
  if (!targets.length) {
    await showAppAlert({ title: '비밀번호 해제', body: '비밀번호가 설정된 파일을 선택해 주세요.' });
    return [];
  }
  /** @type {Array<{ from: string, to: string }>} */
  const unlocked = [];
  const errors = [];
  for (const entry of targets) {
    try {
      const password = await promptFilePassword({
        mode: 'remove',
        fileName: entry.name || entry.relativePath.split('/').pop(),
      });
      if (!password) continue;
      const to = await unlockFileWithPassword(entry.relativePath, password);
      unlocked.push({ from: entry.relativePath, to });
    } catch (err) {
      errors.push(`${entry.name || entry.relativePath}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (errors.length) {
    await showAppAlert({
      title: '비밀번호 해제',
      body: errors.join('\n'),
    });
  }
  return unlocked;
}
