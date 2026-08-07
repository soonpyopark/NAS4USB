/**
 * Bridge so non-React helpers (e.g. openFileGuard) can show in-app alerts.
 * Prefer this over `window.alert` — Electron native dialogs can leave login
 * inputs non-editable afterwards.
 */

/** @type {null | ((options: { title?: string, body?: string }) => Promise<void>)} */
let alertHandler = null;

/**
 * @type {null | ((options: {
 *   title?: string,
 *   body?: string,
 *   primaryLabel?: string,
 *   secondaryLabel?: string,
 *   cancelLabel?: string,
 * }) => Promise<'primary' | 'secondary' | null>)}
 */
let choiceHandler = null;

/**
 * @param {(options: { title?: string, body?: string }) => Promise<void>} handler
 * @returns {() => void}
 */
export function registerAppAlertHandler(handler) {
  alertHandler = handler;
  return () => {
    if (alertHandler === handler) alertHandler = null;
  };
}

/**
 * @param {(options: {
 *   title?: string,
 *   body?: string,
 *   primaryLabel?: string,
 *   secondaryLabel?: string,
 *   cancelLabel?: string,
 * }) => Promise<'primary' | 'secondary' | null>} handler
 * @returns {() => void}
 */
export function registerAppChoiceHandler(handler) {
  choiceHandler = handler;
  return () => {
    if (choiceHandler === handler) choiceHandler = null;
  };
}

/**
 * @param {{
 *   title?: string,
 *   body?: string,
 *   primaryLabel?: string,
 *   secondaryLabel?: string,
 *   cancelLabel?: string,
 * }} options
 * @returns {Promise<'primary' | 'secondary' | null>}
 */
export async function showAppChoice(options) {
  if (choiceHandler) {
    const result = await choiceHandler(options);
    window.dispatchEvent(new CustomEvent('nas4usb:restore-inputs'));
    return result;
  }

  // Fallback when host is not mounted yet (should be rare).
  const accepted = window.confirm(String(options.body ?? options.title ?? ''));
  scheduleRestoreAfterNativeDialog();
  return accepted ? 'primary' : null;
}

/**
 * @param {string | { title?: string, body?: string }} messageOrOptions
 * @param {string} [body]
 * @returns {Promise<void>}
 */
export async function showAppAlert(messageOrOptions, body) {
  const options =
    typeof messageOrOptions === 'string'
      ? { title: '알림', body: body ?? messageOrOptions }
      : {
          title: messageOrOptions?.title ?? '알림',
          body: messageOrOptions?.body ?? '',
        };

  if (alertHandler) {
    await alertHandler(options);
    window.dispatchEvent(new CustomEvent('nas4usb:restore-inputs'));
    return;
  }

  // Fallback when host is not mounted yet (should be rare).
  window.alert(String(options.body ?? ''));
  window.setTimeout(() => {
    restoreFormControlsAfterNativeDialog();
    window.dispatchEvent(new CustomEvent('nas4usb:restore-inputs'));
  }, 0);
}

/**
 * Electron/Chromium can leave login & password inputs non-editable (often
 * `readonly`) after a native `alert` / `confirm` / `prompt` closes.
 */
export function restoreFormControlsAfterNativeDialog() {
  if (typeof document === 'undefined') return;

  for (const el of document.querySelectorAll('input, textarea')) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
    if (el.readOnly) {
      el.readOnly = false;
    }
  }

  try {
    window.focus();
  } catch {
    // ignore
  }
}

function scheduleRestoreAfterNativeDialog() {
  window.setTimeout(() => {
    restoreFormControlsAfterNativeDialog();
    window.dispatchEvent(new CustomEvent('nas4usb:restore-inputs'));
  }, 0);
}

/**
 * Fire-and-forget alert (in-app when host is ready).
 * @param {string} message
 */
export function nativeAlert(message) {
  void showAppAlert({ title: '알림', body: message });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @returns {string | null}
 */
export function nativePrompt(message, defaultValue) {
  const result = window.prompt(message, defaultValue);
  scheduleRestoreAfterNativeDialog();
  return result;
}
