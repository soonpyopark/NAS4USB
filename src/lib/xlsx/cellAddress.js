/**
 * @param {string} letters
 */
export function columnLettersToIndex(letters) {
  let result = 0;
  for (let i = 0; i < letters.length; i += 1) {
    result = result * 26 + (letters.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * @param {number} index
 */
export function columnIndexToLetters(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * @param {string} address
 * @returns {{ row: number, col: number } | null}
 */
export function a1ToRowCol(address) {
  const match = /^([A-Za-z]+)(\d+)$/.exec(String(address).trim());
  if (!match) return null;
  return {
    col: columnLettersToIndex(match[1].toUpperCase()),
    row: Number.parseInt(match[2], 10) - 1,
  };
}

/**
 * @param {number} row
 * @param {number} col
 */
export function rowColToA1(row, col) {
  return `${columnIndexToLetters(col)}${row + 1}`;
}

/**
 * @param {number} row
 * @param {number} col
 */
export function toRowColKey(row, col) {
  return `${row}_${col}`;
}

/**
 * @param {string} key
 * @returns {{ row: number, col: number } | null}
 */
export function parseRowColKey(key) {
  const [rowText, colText] = String(key).split('_');
  const row = Number.parseInt(rowText, 10);
  const col = Number.parseInt(colText, 10);
  if (Number.isNaN(row) || Number.isNaN(col)) return null;
  return { row, col };
}

/**
 * @param {Record<string, string | number>} cells
 * @returns {Record<string, string>}
 */
export function normalizeCellsToRowCol(cells) {
  /** @type {Record<string, string>} */
  const normalized = {};

  for (const [key, rawValue] of Object.entries(cells ?? {})) {
    const value = rawValue == null ? '' : String(rawValue);
    const parsed = parseRowColKey(key);
    if (parsed) {
      normalized[toRowColKey(parsed.row, parsed.col)] = value;
      continue;
    }

    const a1 = a1ToRowCol(key);
    if (a1) {
      normalized[toRowColKey(a1.row, a1.col)] = value;
    }
  }

  return normalized;
}

/**
 * @param {Record<string, string | number>} cells
 */
export function getGridBounds(cells, { minRows = 30, minCols = 12 } = {}) {
  let maxRow = minRows - 1;
  let maxCol = minCols - 1;

  for (const key of Object.keys(normalizeCellsToRowCol(cells))) {
    const parsed = parseRowColKey(key);
    if (!parsed) continue;
    maxRow = Math.max(maxRow, parsed.row);
    maxCol = Math.max(maxCol, parsed.col);
  }

  return {
    rows: maxRow + 1,
    cols: maxCol + 1,
  };
}
