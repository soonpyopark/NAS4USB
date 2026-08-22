import fs from 'node:fs/promises';
import XLSX from 'xlsx-js-style';
import { FORTUNE_SIDECAR_SUFFIX } from '../../../shared/fortuneSheetSidecar.js';

/**
 * @param {unknown} value
 */
function cellText(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 19).replace('T', ' ');
    return iso || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      const text = value.richText.map((part) => part.text || '').join('').trim();
      return text || null;
    }
    if (value.w != null) return cellText(value.w);
    if (value.result != null) return cellText(value.result);
    if (value.text != null) return cellText(value.text);
    if (value.v != null) return cellText(value.v);
  }
  const text = String(value).trim();
  return text || null;
}

/**
 * @param {unknown} value
 */
function fortuneCellText(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return cellText(value);
  return cellText(value.m ?? value.v ?? value.w ?? value.text);
}

/**
 * @param {string} filePath
 */
async function parseFortuneSidecar(filePath) {
  try {
    const raw = await fs.readFile(`${filePath}${FORTUNE_SIDECAR_SUFFIX}`, 'utf8');
    const parsed = JSON.parse(raw);
    const sheets = Array.isArray(parsed?.sheets) ? parsed.sheets : [];
    const records = [];
    for (const sheet of sheets) {
      const sheetName = String(sheet?.name || 'Sheet1');
      const cells = Array.isArray(sheet?.celldata) ? sheet.celldata : [];
      for (const cell of cells) {
        const row = Number(cell?.r);
        const col = Number(cell?.c);
        if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
        const text = fortuneCellText(cell?.v);
        if (text == null) continue;
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        records.push({
          location_label: `${sheetName}!${address}`,
          location_json: JSON.stringify({
            sheet: sheetName,
            row: row + 1,
            col: col + 1,
            cell: address,
          }),
          content: text,
        });
      }
    }
    return records;
  } catch {
    return [];
  }
}

/**
 * @param {string} filePath
 */
export async function parseExcel(filePath) {
  const byKey = new Map();
  const push = (record) => {
    byKey.set(record.location_label, record);
  };

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true, cellText: true });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      for (const address of Object.keys(sheet)) {
        if (address.startsWith('!')) continue;
        const cell = sheet[address];
        const text = cellText(cell?.w ?? cell?.v ?? cell);
        if (text == null) continue;
        const decoded = XLSX.utils.decode_cell(address);
        push({
          location_label: `${sheetName}!${address}`,
          location_json: JSON.stringify({
            sheet: sheetName,
            row: decoded.r + 1,
            col: decoded.c + 1,
            cell: address,
          }),
          content: text,
        });
      }
    }
  } catch {
    // Empty/new Fortune workbooks may have no XLSX cells yet.
  }

  for (const record of await parseFortuneSidecar(filePath)) {
    push(record);
  }

  return [...byKey.values()];
}
