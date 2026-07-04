import * as XLSX from 'xlsx';
import { getGridBounds, normalizeCellsToRowCol, parseRowColKey, toRowColKey } from './cellAddress.js';

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 12;

/**
 * @param {string} value
 */
function toCellValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(numeric) === value) {
    return numeric;
  }
  return value;
}

/**
 * @param {import('xlsx').CellObject | undefined} cell
 * @returns {import('@fortune-sheet/core').Cell | null}
 */
function xlsxCellToFortuneCell(cell) {
  if (!cell) return null;
  if (cell.v == null && cell.f == null) return null;

  /** @type {import('@fortune-sheet/core').Cell} */
  const fortuneCell = {
    v: cell.v,
    m: cell.w ?? (cell.v == null ? '' : String(cell.v)),
  };

  if (cell.f) {
    fortuneCell.f = cell.f;
  }

  if (cell.s?.fgColor?.rgb) {
    fortuneCell.bg = `#${cell.s.fgColor.rgb.slice(-6)}`;
  }
  if (cell.s?.font?.sz) {
    fortuneCell.fs = cell.s.font.sz;
  }
  if (cell.s?.font?.bold) {
    fortuneCell.bl = 1;
  }
  if (cell.s?.font?.italic) {
    fortuneCell.it = 1;
  }

  return fortuneCell;
}

/**
 * @param {import('xlsx').WorkSheet} sheet
 */
function getSheetBounds(sheet) {
  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    return {
      rows: Math.max(DEFAULT_ROWS, range.e.r + 1),
      cols: Math.max(DEFAULT_COLS, range.e.c + 1),
    };
  }

  /** @type {Record<string, string | number>} */
  const cells = {};
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const decoded = XLSX.utils.decode_cell(address);
    cells[toRowColKey(decoded.r, decoded.c)] = cell?.v == null ? '' : String(cell.v);
  }

  return getGridBounds(cells, { minRows: DEFAULT_ROWS, minCols: DEFAULT_COLS });
}

/**
 * @param {import('xlsx').WorkSheet} sheet
 * @param {string} name
 * @param {string} id
 * @param {number} order
 * @param {boolean} isActive
 * @returns {import('@fortune-sheet/core').Sheet}
 */
export function xlsxSheetToFortuneSheet(sheet, name, id, order, isActive) {
  const bounds = getSheetBounds(sheet);
  /** @type {import('@fortune-sheet/core').CellWithRowAndCol[]} */
  const celldata = [];

  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const decoded = XLSX.utils.decode_cell(address);
    const fortuneCell = xlsxCellToFortuneCell(cell);
    if (!fortuneCell) continue;
    celldata.push({ r: decoded.r, c: decoded.c, v: fortuneCell });
  }

  return {
    name,
    id,
    order,
    status: isActive ? 1 : 0,
    row: bounds.rows,
    column: bounds.cols,
    celldata,
  };
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {import('@fortune-sheet/core').Sheet[]}
 */
export function xlsxBufferToFortuneSheets(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true });
  return workbook.SheetNames.map((name, index) =>
    xlsxSheetToFortuneSheet(
      workbook.Sheets[name] ?? {},
      name,
      String(index),
      index,
      index === 0,
    ),
  );
}

/**
 * @param {Record<string, string | number>} cells
 * @param {string} [sheetName]
 */
export function cellsToFortuneSheets(cells, sheetName = 'Sheet1') {
  const normalized = normalizeCellsToRowCol(cells);
  const bounds = getGridBounds(normalized);
  /** @type {import('@fortune-sheet/core').CellWithRowAndCol[]} */
  const celldata = [];

  for (const [key, rawValue] of Object.entries(normalized)) {
    const parsed = parseRowColKey(key);
    if (!parsed || rawValue === '') continue;
    const value = String(rawValue);
    const cellValue = toCellValue(value);
    celldata.push({
      r: parsed.row,
      c: parsed.col,
      v: { v: cellValue, m: String(cellValue) },
    });
  }

  return [{
    name: sheetName,
    id: '0',
    order: 0,
    status: 1,
    row: bounds.rows,
    column: bounds.cols,
    celldata,
  }];
}

/**
 * @returns {import('@fortune-sheet/core').Sheet[]}
 */
export function createEmptyFortuneSheets(sheetName = 'Sheet1') {
  return [{
    name: sheetName,
    id: '0',
    order: 0,
    status: 1,
    row: DEFAULT_ROWS,
    column: DEFAULT_COLS,
    celldata: [],
  }];
}

/**
 * @param {import('@fortune-sheet/core').Cell | null | undefined} cell
 */
function readCellText(cell) {
  if (!cell) return '';
  const value = cell.m ?? cell.v;
  return value == null ? '' : String(value);
}

/**
 * @param {import('@fortune-sheet/core').Sheet} sheet
 * @returns {import('@fortune-sheet/core').CellMatrix}
 */
function sheetToMatrix(sheet) {
  if (Array.isArray(sheet.data) && sheet.data.length > 0) {
    return sheet.data;
  }

  /** @type {import('@fortune-sheet/core').CellMatrix} */
  const matrix = [];
  for (const entry of sheet.celldata ?? []) {
    if (!matrix[entry.r]) matrix[entry.r] = [];
    matrix[entry.r][entry.c] = entry.v;
  }
  return matrix;
}

/**
 * @param {import('@fortune-sheet/core').Sheet} sheet
 * @returns {import('xlsx').WorkSheet}
 */
function fortuneSheetToXlsxWorksheet(sheet) {
  /** @type {import('xlsx').WorkSheet} */
  const worksheet = {};
  const matrix = sheetToMatrix(sheet);
  let maxRow = 0;
  let maxCol = 0;

  matrix.forEach((row, rowIndex) => {
    if (!row) return;
    row.forEach((cell, colIndex) => {
      if (!cell) return;
      const text = readCellText(cell);
      if (text === '' && !cell.f) return;

      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      /** @type {import('xlsx').CellObject} */
      const xlsxCell = {
        v: cell.v ?? text,
        t: typeof cell.v === 'number' ? 'n' : 's',
      };
      if (cell.f) xlsxCell.f = cell.f;
      if (cell.m != null) xlsxCell.w = String(cell.m);
      worksheet[address] = xlsxCell;
      maxRow = Math.max(maxRow, rowIndex);
      maxCol = Math.max(maxCol, colIndex);
    });
  });

  if (maxRow >= 0 && maxCol >= 0) {
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });
  }

  return worksheet;
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ bookType?: 'xlsx' | 'biff8' }} [options]
 * @returns {Uint8Array}
 */
export function fortuneSheetsToXlsxBytes(sheets, { bookType = 'xlsx' } = {}) {
  const workbook = XLSX.utils.book_new();
  const sorted = [...sheets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const sheet of sorted) {
    XLSX.utils.book_append_sheet(
      workbook,
      fortuneSheetToXlsxWorksheet(sheet),
      sheet.name || 'Sheet1',
    );
  }

  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(workbook, {}, 'Sheet1');
  }

  return new Uint8Array(XLSX.write(workbook, { bookType, type: 'array' }));
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @returns {Record<string, string>}
 */
export function fortuneSheetsToCells(sheets) {
  const sheet = sheets?.[0];
  if (!sheet) return {};

  /** @type {Record<string, string>} */
  const cells = {};
  const matrix = sheetToMatrix(sheet);

  matrix.forEach((row, rowIndex) => {
    if (!row) return;
    row.forEach((cell, colIndex) => {
      const value = readCellText(cell);
      if (value !== '') {
        cells[toRowColKey(rowIndex, colIndex)] = value;
      }
    });
  });

  return cells;
}
