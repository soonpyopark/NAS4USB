/** Full FortuneSheet state sidecar for `.xlsx` / `.xls`, e.g. `NoName.xlsx.fortune.json`. */
export const FORTUNE_SIDECAR_SUFFIX = '.fortune.json';

export const FORTUNE_SIDECAR_FORMAT = 'fortune-sheet';
export const FORTUNE_SIDECAR_VERSION = 1;

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isFortuneSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  const base = normalized.split('/').pop() ?? normalized;
  return base.endsWith(FORTUNE_SIDECAR_SUFFIX);
}

/**
 * @param {string} spreadsheetRelativePath e.g. `folder/NoName.xlsx`
 */
export function getFortuneSidecarPath(spreadsheetRelativePath) {
  return `${normalizeRelativePath(spreadsheetRelativePath)}${FORTUNE_SIDECAR_SUFFIX}`;
}

/**
 * @param {string} sidecarRelativePath e.g. `NoName.xlsx.fortune.json`
 * @returns {string | null}
 */
export function getSpreadsheetPathForFortuneSidecar(sidecarRelativePath) {
  if (!isFortuneSidecarRelativePath(sidecarRelativePath)) return null;
  return normalizeRelativePath(sidecarRelativePath).slice(0, -FORTUNE_SIDECAR_SUFFIX.length);
}

/**
 * @param {string} relativePath
 */
export function isSpreadsheetDocumentRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const base = normalized.split('/').pop() ?? normalized;
  return /\.(xlsx|xls)$/i.test(base) && !isFortuneSidecarRelativePath(relativePath);
}

/**
 * @param {Array<{ relativePath: string }>} entries
 */
export function filterFortuneSidecarFromEntries(entries) {
  return entries.filter((entry) => !isFortuneSidecarRelativePath(entry.relativePath));
}
