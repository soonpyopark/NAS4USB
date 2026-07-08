import { SHARE_LINK_MODE_EDIT, SHARE_LINK_MODE_VIEW, normalizeShareLinkMode } from '../../shared/shareLinkModes.js';
import { getShareTokenFromUrl } from './shareAccess.js';

/**
 * 공유 링크로 연 문서의 모드.
 * URL에 share 토큰이 있으면 mode 미지정·레거시는 보기 전용으로 취급.
 * @param {string | null | undefined} mode
 * @returns {'view' | 'edit' | null} null = 공유 링크 아님
 */
export function resolveOpenShareMode(mode) {
  if (!getShareTokenFromUrl()) return null;
  return normalizeShareLinkMode(mode) ?? SHARE_LINK_MODE_VIEW;
}

/**
 * @param {string | null | undefined} shareMode
 */
export function isShareViewOnly(shareMode) {
  return shareMode === SHARE_LINK_MODE_VIEW;
}

/**
 * @param {string | null | undefined} shareMode
 */
export function isShareEditable(shareMode) {
  return shareMode === SHARE_LINK_MODE_EDIT;
}

export { SHARE_LINK_MODE_EDIT, SHARE_LINK_MODE_VIEW };
