/**
 * NAS4USB accent theme. One hex drives every accent surface in the app: the
 * whole palette is derived here and published as CSS variables, so components
 * only ever reference the `nas-*` Tailwind tokens.
 */

/** Matches the original hard-coded `nas.accent`, so an unset theme looks unchanged. */
export const DEFAULT_ACCENT_COLOR = '#3b82f6';

/** Preset swatches offered in 설정 → 일반 → 테마 색상. */
export const ACCENT_COLOR_PRESETS = [
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#0ea5e9',
  '#06b6d4',
  '#0d9488',
  '#059669',
  '#16a34a',
  '#65a30d',
  '#ca8a04',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
  '#e11d48',
  '#db2777',
  '#c026d3',
  '#9333ea',
  '#7c3aed',
  '#4f46e5',
  '#475569',
  '#57534e',
  '#795548',
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
  const text = String(value ?? '').trim();
  return HEX_PATTERN.test(text) ? text.toLowerCase() : fallback;
}

/**
 * @param {string} hex
 */
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * @param {number} value
 */
function toHexByte(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

/**
 * Blends `hex` toward `other`; `weight` is the share of `hex` that survives.
 * @param {string} hex
 * @param {string} other
 * @param {number} weight
 */
function mix(hex, other, weight) {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  return `#${[
    toHexByte(a.r * weight + b.r * (1 - weight)),
    toHexByte(a.g * weight + b.g * (1 - weight)),
    toHexByte(a.b * weight + b.b * (1 - weight)),
  ].join('')}`;
}

const WHITE = '#ffffff';
const BLACK = '#000000';
const SIDEBAR_BASE = '#0f172a';
const SIDEBAR_HOVER_BASE = '#334155';

/**
 * Tailwind needs bare `r g b` channels so `bg-nas-accent/50` can inject an alpha.
 * @param {string} hex
 */
function toChannels(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/**
 * The sidebar keeps a near-slate base with only a hint of the accent, so bright
 * or pale accents can't turn it into an unreadable block of colour.
 *
 * @param {unknown} accent
 * @returns {Record<string, string>} CSS variable name → `r g b` channels
 */
export function accentCssVariables(accent) {
  const base = normalizeAccentColor(accent);
  return {
    '--nas-accent': toChannels(base),
    '--nas-accent-hover': toChannels(mix(base, BLACK, 0.82)),
    '--nas-accent-soft': toChannels(mix(base, WHITE, 0.1)),
    '--nas-accent-soft-hover': toChannels(mix(base, WHITE, 0.18)),
    '--nas-accent-border': toChannels(mix(base, WHITE, 0.35)),
    '--nas-accent-text': toChannels(mix(base, BLACK, 0.55)),
    '--nas-sidebar': toChannels(mix(base, SIDEBAR_BASE, 0.14)),
    '--nas-sidebar-hover': toChannels(mix(base, SIDEBAR_HOVER_BASE, 0.16)),
  };
}
