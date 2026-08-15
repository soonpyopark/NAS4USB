/** Preset folder tints. Empty key = follow the depth cycle. Hex = custom. */
export const FOLDER_COLOR_KEYS = ['red', 'amber', 'sky', 'lime', 'yellow', 'fuchsia'];

/** @type {Record<string, { label: string, className: string, swatch: string }>} */
export const FOLDER_COLORS = {
  red: { label: '빨강', className: '!text-red-500', swatch: '#ef4444' },
  amber: { label: '호박', className: '!text-amber-500', swatch: '#f59e0b' },
  sky: { label: '하늘', className: '!text-sky-400', swatch: '#38bdf8' },
  lime: { label: '멜론', className: '!text-lime-300', swatch: '#bef264' },
  yellow: { label: '레몬', className: '!text-yellow-300', swatch: '#fde047' },
  fuchsia: { label: '자주', className: '!text-fuchsia-600', swatch: '#c026d3' },
};

const HEX6_PATTERN = /^#([0-9a-fA-F]{6})$/;
const HEX3_PATTERN = /^#([0-9a-fA-F]{3})$/;

/**
 * @param {unknown} value
 * @returns {string} preset key, `#rrggbb`, or `''`
 */
export function normalizeFolderColorValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (FOLDER_COLOR_KEYS.includes(trimmed)) return trimmed;
  if (HEX6_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  const short = trimmed.match(HEX3_PATTERN);
  if (short) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '';
}

/** @deprecated use normalizeFolderColorValue */
export function normalizeFolderColorKey(value) {
  return normalizeFolderColorValue(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function folderColorClassName(value) {
  const key = normalizeFolderColorValue(value);
  if (!key || key.startsWith('#')) return '';
  return FOLDER_COLORS[key].className;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function folderColorHex(value) {
  const key = normalizeFolderColorValue(value);
  if (!key) return '';
  if (key.startsWith('#')) return key;
  return FOLDER_COLORS[key]?.swatch ?? '';
}

/**
 * @param {unknown} value
 */
export function isCustomFolderColor(value) {
  return normalizeFolderColorValue(value).startsWith('#');
}
