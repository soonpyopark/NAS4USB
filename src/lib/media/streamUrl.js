import { getShareTokenFromUrl } from '../shareAccess.js';

/**
 * @param {string} relativePath
 */
export function buildMediaStreamUrl(relativePath) {
  const params = new URLSearchParams({ path: relativePath });
  const shareToken = getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  return `/api/fs/stream?${params.toString()}`;
}

/**
 * @param {HTMLMediaElement} media
 */
export function getMediaBufferedPercent(media) {
  if (!media.duration || !Number.isFinite(media.duration) || media.duration <= 0) {
    return 0;
  }

  const ranges = media.buffered;
  if (!ranges.length) return 0;

  let bufferedEnd = 0;
  for (let i = 0; i < ranges.length; i += 1) {
    bufferedEnd = Math.max(bufferedEnd, ranges.end(i));
  }

  return Math.min(100, Math.round((bufferedEnd / media.duration) * 100));
}
