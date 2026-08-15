/** Preset folder tints. Empty key = follow the depth cycle. Hex = custom. */
export const FOLDER_COLOR_KEYS = [
  'red',
  'rose',
  'amber',
  'orange',
  'yellow',
  'lime',
  'emerald',
  'teal',
  'sky',
  'indigo',
  'violet',
  'fuchsia',
  'pink',
  'slate',
];

/** @type {Record<string, { label: string, className: string, swatch: string }>} */
export const FOLDER_COLORS = {
  red: { label: '빨강', className: '!text-red-500', swatch: '#ef4444' },
  rose: { label: '장미', className: '!text-rose-400', swatch: '#fb7185' },
  amber: { label: '호박', className: '!text-amber-500', swatch: '#f59e0b' },
  orange: { label: '귤', className: '!text-orange-400', swatch: '#fb923c' },
  yellow: { label: '레몬', className: '!text-yellow-300', swatch: '#fde047' },
  lime: { label: '멜론', className: '!text-lime-300', swatch: '#bef264' },
  emerald: { label: '숲', className: '!text-emerald-500', swatch: '#10b981' },
  teal: { label: '민트', className: '!text-teal-400', swatch: '#2dd4bf' },
  sky: { label: '하늘', className: '!text-sky-400', swatch: '#38bdf8' },
  indigo: { label: '남빛', className: '!text-indigo-400', swatch: '#818cf8' },
  violet: { label: '라벤더', className: '!text-violet-400', swatch: '#a78bfa' },
  fuchsia: { label: '자주', className: '!text-fuchsia-600', swatch: '#c026d3' },
  pink: { label: '분홍', className: '!text-pink-400', swatch: '#f472b6' },
  slate: { label: '안개', className: '!text-slate-400', swatch: '#94a3b8' },
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
 * @param {Iterable<string> | null | undefined} [exclude]
 */
export function pickRandomFolderColorKey(exclude) {
  const blocked = new Set(
    [...(exclude ?? [])].map((value) => normalizeFolderColorValue(value)).filter(Boolean),
  );
  const pool = FOLDER_COLOR_KEYS.filter((key) => !blocked.has(key));
  const keys = pool.length > 0 ? pool : FOLDER_COLOR_KEYS;
  return keys[Math.floor(Math.random() * keys.length)];
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
