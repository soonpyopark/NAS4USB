import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import {
  createEmptyFortuneSheets,
  fortuneSheetsToDelimitedBytes,
  fortuneSheetsToXlsxBytes,
  xlsxBufferToFortuneSheets,
} from './fortuneSheetConvert.js';

/**
 * @param {string | null | undefined} fileNameOrPath
 * @returns {'xlsx' | 'xls' | 'csv' | 'tsv'}
 */
export function getSpreadsheetKind(fileNameOrPath) {
  const name = String(fileNameOrPath ?? '').toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.tsv')) return 'tsv';
  if (name.endsWith('.xls')) return 'xls';
  return 'xlsx';
}

/**
 * @typedef {{ sheets: import('@fortune-sheet/core').Sheet[], sheetName: string, sheetNames: string[] }} ParsedSpreadsheet
 */

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {{ kind?: 'xlsx' | 'xls' | 'csv' | 'tsv' }} [options]
 * @returns {Promise<ParsedSpreadsheet>}
 */
export async function parseSpreadsheetBuffer(buffer, options = {}) {
  const sheets = await xlsxBufferToFortuneSheets(buffer, options);
  const sheetNames = sheets.map((sheet) => sheet.name);
  return {
    sheets,
    sheetName: sheetNames[0] ?? 'Sheet1',
    sheetNames,
  };
}

/**
 * @param {string} base64
 * @param {{ kind?: 'xlsx' | 'xls' | 'csv' | 'tsv' }} [options]
 * @returns {Promise<ParsedSpreadsheet>}
 */
export async function parseSpreadsheetBase64(base64, options = {}) {
  if (!base64) {
    const sheets = createEmptyFortuneSheets();
    return {
      sheets,
      sheetName: 'Sheet1',
      sheetNames: ['Sheet1'],
    };
  }
  return parseSpreadsheetBuffer(base64ToBytes(base64), options);
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ bookType?: 'xlsx' | 'biff8' | 'csv' | 'tsv' }} [options]
 * @returns {Uint8Array}
 */
export function buildSpreadsheetBytes(sheets, { bookType = 'xlsx' } = {}) {
  if (bookType === 'csv' || bookType === 'tsv') {
    return fortuneSheetsToDelimitedBytes(sheets, { delimiter: bookType === 'tsv' ? '\t' : ',' });
  }
  return fortuneSheetsToXlsxBytes(sheets, { bookType });
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ bookType?: 'xlsx' | 'biff8' }} [options]
 */
export function buildSpreadsheetBase64(sheets, options = {}) {
  return bytesToBase64(buildSpreadsheetBytes(sheets, options));
}
