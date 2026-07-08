import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { cloneFortuneSheets } from './cloneFortuneSheets.js';
import {
  FORTUNE_SIDECAR_FORMAT,
  FORTUNE_SIDECAR_VERSION,
  getFortuneSidecarPath,
} from '../../../shared/fortuneSheetSidecar.js';
import { parseSpreadsheetBase64 } from './xlsxIO.js';

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 */
export function prepareSheetsForPersistence(sheets) {
  return cloneFortuneSheets(sheets);
}

/**
 * @param {unknown} payload
 * @returns {import('@fortune-sheet/core').Sheet[] | null}
 */
export function parseFortuneSidecarPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const record = /** @type {{ format?: string, version?: number, sheets?: unknown }} */ (payload);
  if (record.format !== FORTUNE_SIDECAR_FORMAT) return null;
  if (!Array.isArray(record.sheets) || record.sheets.length === 0) return null;
  if (!record.sheets.every((sheet) => sheet && typeof sheet === 'object' && typeof sheet.name === 'string')) {
    return null;
  }
  return prepareSheetsForPersistence(/** @type {import('@fortune-sheet/core').Sheet[]} */ (record.sheets));
}

/**
 * @param {string} base64
 */
export function parseFortuneSidecarBase64(base64) {
  if (!base64) return null;
  try {
    const text = new TextDecoder('utf-8').decode(base64ToBytes(base64));
    return parseFortuneSidecarPayload(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 */
export function buildFortuneSidecarBase64(sheets) {
  const payload = {
    format: FORTUNE_SIDECAR_FORMAT,
    version: FORTUNE_SIDECAR_VERSION,
    exportedAt: new Date().toISOString(),
    sheets: prepareSheetsForPersistence(sheets),
  };
  const text = JSON.stringify(payload);
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * @param {string} spreadsheetRelativePath
 * @param {string} xlsxBase64
 * @returns {Promise<{ sheets: import('@fortune-sheet/core').Sheet[], sheetName: string, sheetNames: string[], source: 'sidecar' | 'xlsx' }>}
 */
export async function loadSpreadsheetDocument(spreadsheetRelativePath, xlsxBase64) {
  const sidecarPath = getFortuneSidecarPath(spreadsheetRelativePath);

  try {
    const sidecarBase64 = await window.nas4usb.fs.readFile(sidecarPath);
    const sheets = parseFortuneSidecarBase64(sidecarBase64);
    if (sheets) {
      const sheetNames = sheets.map((sheet) => sheet.name);
      return {
        sheets,
        sheetName: sheetNames[0] ?? 'Sheet1',
        sheetNames,
        source: 'sidecar',
      };
    }
  } catch {
    // fall back to xlsx
  }

  const parsed = await parseSpreadsheetBase64(xlsxBase64);
  return { ...parsed, source: 'xlsx' };
}

/**
 * @param {string} spreadsheetRelativePath
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 */
export async function writeFortuneSidecar(spreadsheetRelativePath, sheets) {
  const sidecarPath = getFortuneSidecarPath(spreadsheetRelativePath);
  const base64 = buildFortuneSidecarBase64(sheets);
  await window.nas4usb.fs.writeFile(sidecarPath, base64);
}

/**
 * @param {string} spreadsheetRelativePath
 */
export async function removeFortuneSidecar(spreadsheetRelativePath) {
  const sidecarPath = getFortuneSidecarPath(spreadsheetRelativePath);
  try {
    await window.nas4usb.fs.delete(sidecarPath);
  } catch {
    // optional
  }
}
