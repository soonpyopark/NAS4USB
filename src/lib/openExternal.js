/**
 * @param {string} url
 */
export async function openExternalUrl(url) {
  if (window.educowork?.openExternal) {
    await window.educowork.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
