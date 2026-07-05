import { buildShareLinkUrl } from './shareLink.js';

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
  if (!window.educowork?.share?.create) {
    throw new Error('공유링크 API를 사용할 수 없습니다.');
  }

  let token = shareMap[entry.relativePath]?.token;
  if (!token) {
    const result = await window.educowork.share.create({ path: entry.relativePath });
    token = result.token;
    await refreshShareMap();
  }

  return {
    url: buildShareLinkUrl(token, syncInfo),
    fileName: entry.name,
    entry,
  };
}

/**
 * @param {{
 *   entry: { relativePath: string },
 *   refreshShareMap: () => Promise<void>,
 * }} options
 */
export async function revokeShareLinkForEntry({ entry, refreshShareMap }) {
  if (!window.educowork?.share?.revoke) {
    throw new Error('공유링크 API를 사용할 수 없습니다.');
  }

  const result = await window.educowork.share.revoke({ path: entry.relativePath });
  await refreshShareMap();

  if (!result?.revoked) {
    throw new Error('이 파일에 활성화된 공유링크가 없습니다.');
  }
}
