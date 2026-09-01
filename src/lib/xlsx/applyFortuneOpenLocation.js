/**
 * Activate the sheet/cell recorded by the document index.
 * @param {import('@fortune-sheet/core').Sheet[]} sheets
 * @param {{ sheet?: string, row?: number, col?: number, cell?: string } | null | undefined} location
 */
export function applyFortuneOpenLocation(sheets, location) {
  if (!Array.isArray(sheets) || !sheets.length || !location) return sheets;

  let targetIndex = sheets.findIndex((sheet) => sheet?.name && sheet.name === location.sheet);
  if (targetIndex < 0) targetIndex = 0;

  let row = Number(location.row);
  let col = Number(location.col);
  if ((!Number.isFinite(row) || row < 1 || !Number.isFinite(col) || col < 1) && location.cell) {
    const decoded = decodeA1(location.cell);
    if (decoded) {
      row = decoded.row;
      col = decoded.col;
    }
  }

  return sheets.map((sheet, index) => {
    const next = { ...sheet, status: index === targetIndex ? 1 : 0 };
    if (
      index === targetIndex &&
      Number.isFinite(row) &&
      row >= 1 &&
      Number.isFinite(col) &&
      col >= 1
    ) {
      next.luckysheet_select_save = [
        {
          row: [row - 1, row - 1],
          column: [col - 1, col - 1],
        },
      ];
    }
    return next;
  });
}

/**
 * @param {string} address
 * @returns {{ row: number, col: number } | null}
 */
function decodeA1(address) {
  const match = String(address || '')
    .trim()
    .toUpperCase()
    .match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  const row = Number(match[2]);
  if (!col || !Number.isFinite(row) || row < 1) return null;
  return { row, col };
}
