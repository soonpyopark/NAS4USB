import {
  RELEASES_PAGE_URL,
  isUpdateAvailable,
  versionLabel,
} from '../../shared/updateCheck.js';
import { openExternalUrl } from './openExternal.js';

/**
 * @typedef {{
 *   alert: (options: { title?: string, body?: string, confirmLabel?: string }) => Promise<void>,
 *   confirm: (options: {
 *     title?: string,
 *     body?: string,
 *     confirmLabel?: string,
 *     cancelLabel?: string,
 *   }) => Promise<boolean>,
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
      body: `새 버전이 있습니다: ${versionLabel(result.latest || '')}\n\n현재 버전: ${current}`,
      confirmLabel: '다운로드',
      cancelLabel: '나중에',
    });
    if (open) await openExternalUrl(result.releaseUrl || RELEASES_PAGE_URL);
    return;
  }

  await dialog.alert({
    title,
    body: `최신 버전입니다.\n\n현재 버전: ${current}`,
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
