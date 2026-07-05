import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import {
  createEmptyFortuneSheets,
  fortuneSheetsToXlsxBytes,
  xlsxBufferToFortuneSheets,
} from './fortuneSheetConvert.js';

/**
 * @typedef {{ sheets: import('@fortune-sheet/core').Sheet[], sheetName: string, sheetNames: string[] }} ParsedSpreadsheet
 */

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {Promise<ParsedSpreadsheet>}
 */
export async function parseSpreadsheetBuffer(buffer) {
  const sheets = await xlsxBufferToFortuneSheets(buffer);
  const sheetNames = sheets.map((sheet) => sheet.name);
  return {
    sheets,
    sheetName: sheetNames[0] ?? 'Sheet1',
    sheetNames,
  };
}

/**
 * @param {string} base64
 * @returns {Promise<ParsedSpreadsheet>}
 */
export async function parseSpreadsheetBase64(base64) {
  if (!base64) {
    const sheets = createEmptyFortuneSheets();
    return {
      sheets,
      sheetName: 'Sheet1',
      sheetNames: ['Sheet1'],
    };
  }
  return parseSpreadsheetBuffer(base64ToBytes(base64));
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ bookType?: 'xlsx' | 'biff8' }} [options]
 * @returns {Uint8Array}
 */
export function buildSpreadsheetBytes(sheets, { bookType = 'xlsx' } = {}) {
  return fortuneSheetsToXlsxBytes(sheets, { bookType });
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ bookType?: 'xlsx' | 'biff8' }} [options]
 */
export function buildSpreadsheetBase64(sheets, options = {}) {
  return bytesToBase64(buildSpreadsheetBytes(sheets, options));
}
