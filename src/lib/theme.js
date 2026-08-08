import {
  DEFAULT_ACCENT_COLOR,
  accentCssVariables,
  normalizeAccentColor,
} from '../../shared/theme.js';

/**
 * Paints the accent palette onto `:root`. Every `nas-*` Tailwind token reads
 * these variables, so one call recolours the whole app without a re-render.
 *
 * @param {unknown} accent
 * @returns {string} the accent that was applied
 */
export function applyAccentColor(accent) {
  const color = normalizeAccentColor(accent);
  const root = document.documentElement;
  if (root.dataset.accentColor === color) return color;

  for (const [name, value] of Object.entries(accentCssVariables(color))) {
    root.style.setProperty(name, value);
  }
  root.dataset.accentColor = color;
  return color;
}

export function currentAccentColor() {
  return normalizeAccentColor(document.documentElement.dataset.accentColor);
}

/**
 * Loads the server-wide accent and applies it. Failures fall back to the
 * built-in default rather than blocking startup.
 */
export async function loadAndApplyAccentColor() {
  try {
    const theme = await window.nas4usb?.settings?.getTheme?.();
    return applyAccentColor(theme?.accentColor ?? DEFAULT_ACCENT_COLOR);
  } catch {
    return applyAccentColor(DEFAULT_ACCENT_COLOR);
  }
}
