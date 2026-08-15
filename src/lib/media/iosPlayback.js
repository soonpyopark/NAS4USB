/**
 * iPad/iPhone Chrome is WebKit, not Chromium. iPadOS 13+ often reports as
 * Macintosh, so UA-only checks miss it.
 * @returns {boolean}
 */
export function isIosWebKit() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod|CriOS|FxiOS|EdgiOS/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1;
}
