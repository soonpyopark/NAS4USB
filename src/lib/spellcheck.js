const SPELLCHECK_EVENT = 'nas4usb-spellcheck-changed';

/**
 * @returns {boolean}
 */
export function isSpellcheckEnabled() {
  return document.documentElement.dataset.spellcheck === '1';
}

/**
 * Apply Chromium/HTML spellcheck for this window.
 * @param {unknown} enabled
 * @returns {boolean}
 */
export function applySpellcheckEnabled(enabled) {
  const on = enabled === true;
  document.documentElement.spellcheck = on;
  document.documentElement.dataset.spellcheck = on ? '1' : '0';
  if (document.body) document.body.spellcheck = on;
  window.nas4usb?.spellcheck?.setEnabled?.(on);
  window.dispatchEvent(new CustomEvent(SPELLCHECK_EVENT, { detail: on }));
  return on;
}

/**
 * @param {(enabled: boolean) => void} callback
 * @returns {() => void}
 */
export function subscribeSpellcheckEnabled(callback) {
  const handler = () => callback(isSpellcheckEnabled());
  window.addEventListener(SPELLCHECK_EVENT, handler);
  return () => window.removeEventListener(SPELLCHECK_EVENT, handler);
}
