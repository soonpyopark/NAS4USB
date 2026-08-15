export const GIB = 1024 * 1024 * 1024;

export const DEFAULT_VIDEO_PREVIEW_CACHE_MAX_BYTES = 2 * GIB;

export const VIDEO_PREVIEW_CACHE_PRESETS = [
  { id: '1g', label: '1 GB', bytes: 1 * GIB },
  { id: '2g', label: '2 GB', bytes: 2 * GIB },
  { id: '5g', label: '5 GB', bytes: 5 * GIB },
  { id: '10g', label: '10 GB', bytes: 10 * GIB },
  { id: 'unlimited', label: '제한 없음', bytes: 0 },
];

/**
 * 0 = unlimited. Missing/invalid → default 2 GB.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeVideoPreviewCacheMaxBytes(value) {
  if (value === 0 || value === '0') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_VIDEO_PREVIEW_CACHE_MAX_BYTES;
  return Math.round(numeric);
}

/**
 * @param {number} bytes
 */
export function formatByteSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < GIB) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / GIB).toFixed(1)} GB`;
}
