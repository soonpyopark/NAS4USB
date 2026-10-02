import {
  RELEASES_PAGE_URL,
  detectUpdatePlatform,
  isUpdateAvailable,
  resolveUpdateKind,
  versionLabel,
} from '../../shared/updateCheck.js';
import { openExternalUrl } from './openExternal.js';

const SKIPPED_UPDATE_KEY = 'nas4usb.skippedUpdateNotice';

/**
 * @param {import('../../shared/updateCheck.js').UpdateCheckResult} result
 */
export function updateNoticeKey(result) {
  return [detectUpdatePlatform(), result.latest || '', result.latestBuildStamp || ''].join('|');
}

/**
 * @param {import('../../shared/updateCheck.js').UpdateCheckResult} result
 */
export function isStartupNoticeSkipped(result) {
  try {
    return window.localStorage.getItem(SKIPPED_UPDATE_KEY) === updateNoticeKey(result);
  } catch {
    return false;
  }
}

/**
 * @param {import('../../shared/updateCheck.js').UpdateCheckResult} result
 */
export function skipStartupNotice(result) {
  try {
    window.localStorage.setItem(SKIPPED_UPDATE_KEY, updateNoticeKey(result));
  } catch {
    // ignore
  }
}

/**
 * @param {import('../../shared/updateCheck.js').UpdateCheckResult} result
 */
function availableUpdateBody(result) {
  const current = versionLabel(result.current);
  const kind = resolveUpdateKind(result);
  const latest = versionLabel(result.latest || '');
  const stampHint =
    kind === 'build' && result.latestBuildStamp ? `\n최신 빌드: ${result.latestBuildStamp}` : '';
  const currentHint = result.currentBuildStamp ? `${current} (${result.currentBuildStamp})` : current;
  return kind === 'build'
    ? `같은 버전의 새 빌드가 있습니다: ${latest}\n\n현재 버전: ${currentHint}${stampHint}`
    : `새 버전이 있습니다: ${latest}\n\n현재 버전: ${currentHint}${stampHint}`;
}

/**
 * @typedef {{
 *   alert: (options: { title?: string, body?: string, confirmLabel?: string }) => Promise<void>,
 *   confirm: (options: {
 *     title?: string,
 *     body?: string,
 *     confirmLabel?: string,
 *     cancelLabel?: string,
 *   }) => Promise<boolean>,
 *   choose?: (options: {
 *     title?: string,
 *     body?: string,
 *     primaryLabel?: string,
 *     extraLabel?: string,
 *     secondaryLabel?: string,
 *     cancelLabel?: string,
 *   }) => Promise<'primary' | 'extra' | 'secondary' | null>,
 * }} UpdateDialogApi
 */

/**
 * @param {import('../../shared/updateCheck.js').UpdateCheckResult} result
 * @param {UpdateDialogApi} dialog
 */
export async function presentUpdateCheckResult(result, dialog) {
  const title = '업데이트 확인';
  const current = versionLabel(result.current);

  if (!result.ok) {
    const open = await dialog.confirm({
      title,
      body: `업데이트 정보를 확인할 수 없습니다.\n\n${result.error || '알 수 없는 오류'}\n\n현재 버전: ${current}`,
      confirmLabel: '릴리스 페이지 열기',
      cancelLabel: '닫기',
    });
    if (open) await openExternalUrl(RELEASES_PAGE_URL);
    return;
  }

  if (isUpdateAvailable(result)) {
    const open = await dialog.confirm({
      title,
      body: availableUpdateBody(result),
      confirmLabel: '다운로드',
      cancelLabel: '나중에',
    });
    if (open) await openExternalUrl(result.releaseUrl || RELEASES_PAGE_URL);
    return;
  }

  const currentHint = result.currentBuildStamp
    ? `${current} (${result.currentBuildStamp})`
    : current;
  await dialog.alert({
    title,
    body: `최신 버전입니다.\n\n현재 버전: ${currentHint}`,
  });
}

/**
 * @param {UpdateDialogApi} dialog
 */
export async function runUpdateCheck(dialog) {
  const api = window.nas4usb;
  if (!api?.checkForUpdates) {
    await dialog.alert({ title: '업데이트 확인', body: '업데이트 확인을 사용할 수 없습니다.' });
    return;
  }
  const result = await api.checkForUpdates();
  await presentUpdateCheckResult(result, dialog);
}

/**
 * Quiet startup check — only prompt when a newer build exists (Tiny PDF Editor).
 *
 * @param {UpdateDialogApi} dialog
 */
export async function runStartupUpdateCheck(dialog) {
  const api = window.nas4usb;
  if (!api?.checkForUpdates) return;
  const result = await api.checkForUpdates();
  if (!result.ok || !isUpdateAvailable(result) || isStartupNoticeSkipped(result)) return;

  if (typeof dialog.choose === 'function') {
    const choice = await dialog.choose({
      title: '업데이트',
      body: availableUpdateBody(result),
      primaryLabel: '다운로드',
      extraLabel: '이 버전은 알리지 않기',
      secondaryLabel: '',
      cancelLabel: '나중에',
    });
    if (choice === 'primary') await openExternalUrl(result.releaseUrl || RELEASES_PAGE_URL);
    if (choice === 'extra') skipStartupNotice(result);
    return;
  }

  const open = await dialog.confirm({
    title: '업데이트',
    body: availableUpdateBody(result),
    confirmLabel: '다운로드',
    cancelLabel: '나중에',
  });
  if (open) await openExternalUrl(result.releaseUrl || RELEASES_PAGE_URL);
}
