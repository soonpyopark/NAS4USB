/**
 * Soft restore to ImageViewerShell / PdfViewerShell for image + PDF only.
 * See docs/RESTORE-pre-yomikiru-reader.md
 *
 * Flip this constant to `true` and rebuild if localStorage is unavailable.
 */
export const USE_LEGACY_IMAGE_PDF_VIEWERS = false;

const STORAGE_KEY = 'nas4usb.useLegacyImagePdfViewers';

/** Cached from settings.get() — updated by App on boot. */
let settingsLegacyFlag = false;

/**
 * @param {boolean} value
 */
export function setLegacyViewerSettingsFlag(value) {
  settingsLegacyFlag = value === true;
}

/**
 * @param {{ useLegacyImagePdfViewers?: boolean } | null | undefined} [settings]
 */
export function shouldUseLegacyImagePdfViewers(settings) {
  if (USE_LEGACY_IMAGE_PDF_VIEWERS) return true;
  if (settings && settings.useLegacyImagePdfViewers === true) return true;
  if (settingsLegacyFlag) return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
