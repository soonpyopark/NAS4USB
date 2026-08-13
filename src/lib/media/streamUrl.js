import { getShareTokenFromUrl } from '../shareAccess.js';
import { getStoredAdminToken } from '../nas4usbClient.js';

/**
 * @param {string} relativePath
 * @param {{ preview?: boolean }} [options]
 */
export function buildMediaStreamUrl(relativePath, options = {}) {
  const params = new URLSearchParams({ path: relativePath });
  const shareToken = getShareTokenFromUrl();
  if (shareToken) params.set('share', shareToken);
  // <img>/<video>/<audio> issue plain GETs that can't carry the X-Admin-Token header,
  // so pass it as a query param too — the server accepts either.
  const adminToken = getStoredAdminToken();
  if (adminToken) params.set('token', adminToken);
  if (options.preview) {
    return `/api/media/videoPreview?${params.toString()}`;
  }
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
