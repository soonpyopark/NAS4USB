/**
 * @param {string} url
 */
export async function openExternalUrl(url) {
  if (window.nas4usb?.openExternal) {
    await window.nas4usb.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
