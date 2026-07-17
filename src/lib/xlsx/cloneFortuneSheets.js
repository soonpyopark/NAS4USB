/**
 * FortuneSheet (Immer) mutates sheet objects in place. Plain mutable copies are required
 * for the controlled `data` prop — never pass Immer-frozen refs from getAllSheets/onChange.
 *
 * React Workbook init only expands `celldata` into `data` and then overwrites any existing
 * `data` matrix. Sheets returned by getAllSheets() keep `data` and drop `celldata`, so we
 * must rebuild `celldata` before remount/persist or the grid opens blank.
 */

/**
 * @param {import('@fortune-sheet/core').CellMatrix | null | undefined} data
 * @returns {import('@fortune-sheet/core').CellWithRowAndCol[]}
 */
export function dataMatrixToCelldata(data) {
  /** @type {import('@fortune-sheet/core').CellWithRowAndCol[]} */
  const celldata = [];
  if (!Array.isArray(data)) return celldata;

  for (let r = 0; r < data.length; r += 1) {
    const row = data[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c += 1) {
      const value = row[c];
      if (value != null) {
        celldata.push({ r, c, v: value });
      }
    }
  }

  return celldata;
}

/**
 * @param {import('@fortune-sheet/core').Sheet} sheet
 * @returns {import('@fortune-sheet/core').Sheet}
 */
function normalizeSheetForEditor(sheet) {
  if (!sheet || typeof sheet !== 'object') return sheet;

  /** @type {import('@fortune-sheet/core').Sheet} */
  const next = { ...sheet };
  const hasCelldata = Array.isArray(next.celldata) && next.celldata.length > 0;
  const hasData = Array.isArray(next.data) && next.data.length > 0;

  if (!hasCelldata && hasData) {
    next.celldata = dataMatrixToCelldata(next.data);
  }

  // Workbook init always rebuilds `data` from `celldata`; keep payload celldata-only.
  if ('data' in next) {
    delete next.data;
  }

  return next;
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @returns {import('@fortune-sheet/core').Sheet[]}
 */
export function normalizeFortuneSheetsForEditor(sheets) {
  if (!Array.isArray(sheets)) return [];
  return sheets.map((sheet) => normalizeSheetForEditor(sheet));
}

/**
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @returns {import('@fortune-sheet/core').Sheet[]}
 */
export function cloneFortuneSheets(sheets) {
  if (!Array.isArray(sheets)) return [];
  return normalizeFortuneSheetsForEditor(JSON.parse(JSON.stringify(sheets)));
}
