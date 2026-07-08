import { buildShareLinkUrl } from './shareLink.js';
import { SHARE_LINK_MODE_VIEW } from '../../shared/shareLinkModes.js';

/**
 * @param {{
 *   entry: { relativePath: string, name?: string, isDirectory?: boolean },
 *   mode?: 'view' | 'edit',
 *   syncInfo: { port?: number, addresses?: string[] } | null | undefined,
 *   shareMap: Record<string, { token?: string, mode?: string }>,
 *   refreshShareMap: () => Promise<void>,
 * }} options
 * @returns {Promise<{ url: string, fileName?: string, entry: { relativePath: string, name?: string } }>}
 */
export async function setShareLinkForEntry({
  entry,
  mode = SHARE_LINK_MODE_VIEW,
  syncInfo,
  shareMap,
  refreshShareMap,
}) {
  if (!window.nas4usb?.share?.setMode) {
    throw new Error('공유링크 API를 사용할 수 없습니다.');
  }

  const result = await window.nas4usb.share.setMode({ path: entry.relativePath, mode });
  await refreshShareMap();

  return {
    url: buildShareLinkUrl(result.token ?? shareMap[entry.relativePath]?.token, syncInfo),
    fileName: entry.name,
    entry,
  };
}

/**
 * @param {{
 *   entry: { relativePath: string, name?: string, isDirectory?: boolean },
 *   syncInfo: { port?: number, addresses?: string[] } | null | undefined,
 *   shareMap: Record<string, { token?: string }>,
 *   refreshShareMap: () => Promise<void>,
 * }} options
 * @returns {Promise<{ url: string, fileName?: string, entry: { relativePath: string, name?: string } }>}
 */
export async function openShareLinkForEntry({ entry, syncInfo, shareMap, refreshShareMap }) {
  return setShareLinkForEntry({
    entry,
    mode: SHARE_LINK_MODE_VIEW,
    syncInfo,
    shareMap,
    refreshShareMap,
  });
}

/**
 * @param {{
 *   entry: { relativePath: string },
 *   refreshShareMap: () => Promise<void>,
 * }} options
 */
export async function revokeShareLinkForEntry({ entry, refreshShareMap }) {
  if (!window.nas4usb?.share?.setMode) {
    throw new Error('공유링크 API를 사용할 수 없습니다.');
  }

  const result = await window.nas4usb.share.setMode({ path: entry.relativePath, mode: null });
  await refreshShareMap();

  if (result?.revoked === false) {
    throw new Error('이 파일에 활성화된 공유링크가 없습니다.');
  }
}
