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
 * FortuneSheet's own merge action (see `refreshLocalMergeData` in @fortune-sheet/core)
 * stamps an `mc` marker onto every covered cell — the renderer relies on that per-cell
 * marker, not just `config.merge`, to know a cell belongs to a merged range. Sheets
 * built from sources that only know about `config.merge` (raw XLSX import/history, or
 * a sidecar saved before this backfill existed) would otherwise render as unmerged.
 * Idempotent: re-applies the same markers already present from a live editor session.
 * @param {import('@fortune-sheet/core').CellWithRowAndCol[]} celldata
 * @param {NonNullable<import('@fortune-sheet/core').SheetConfig['merge']>} merge
 */
function backfillMergeMarkers(celldata, merge) {
  const indexByKey = new Map();
  celldata.forEach((entry, index) => indexByKey.set(`${entry.r}_${entry.c}`, index));

  for (const anchor of Object.values(merge)) {
    for (let r = anchor.r; r < anchor.r + anchor.rs; r += 1) {
      for (let c = anchor.c; c < anchor.c + anchor.cs; c += 1) {
        const isAnchor = r === anchor.r && c === anchor.c;
        const mc = isAnchor
          ? { r: anchor.r, c: anchor.c, rs: anchor.rs, cs: anchor.cs }
          : { r: anchor.r, c: anchor.c };

        const key = `${r}_${c}`;
        const existingIndex = indexByKey.get(key);
        if (existingIndex != null) {
          celldata[existingIndex] = {
            ...celldata[existingIndex],
            v: { ...celldata[existingIndex].v, mc },
          };
        } else {
          indexByKey.set(key, celldata.length);
          celldata.push({ r, c, v: { mc } });
        }
      }
    }
  }
}

/**
 * @param {import('@fortune-sheet/core').Sheet} sheet
 * @returns {import('@fortune-sheet/core').Sheet}
 */
/**
 * FortuneSheet's bottom ADD grows the live `data` matrix but does not bump `row`/`column`.
 * Empty added rows never appear in `celldata`, so dropping `data` without copying the
 * matrix size makes the next Workbook init keep the old grid — Add looks like a no-op.
 * @param {import('@fortune-sheet/core').CellMatrix | null | undefined} data
 */
function matrixSize(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  let column = 0;
  for (const row of data) {
    if (Array.isArray(row) && row.length > column) column = row.length;
  }
  return { row: data.length, column };
}

function normalizeSheetForEditor(sheet) {
  if (!sheet || typeof sheet !== 'object') return sheet;

  /** @type {import('@fortune-sheet/core').Sheet} */
  const next = { ...sheet };
  const hasCelldata = Array.isArray(next.celldata) && next.celldata.length > 0;
  const hasData = Array.isArray(next.data) && next.data.length > 0;
  const size = matrixSize(next.data);

  if (!hasCelldata && hasData) {
    next.celldata = dataMatrixToCelldata(next.data);
  }

  if (size) {
    next.row = Math.max(Number(next.row) || 0, size.row);
    next.column = Math.max(Number(next.column) || 0, size.column);
  }

  if (next.config?.merge && Array.isArray(next.celldata)) {
    backfillMergeMarkers(next.celldata, next.config.merge);
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

/**
 * @param {import('@fortune-sheet/core').Sheet[] | null | undefined} prev
 * @param {import('@fortune-sheet/core').Sheet[] | null | undefined} next
 */
export function fortuneSheetGridGrew(prev, next) {
  const prevById = new Map((Array.isArray(prev) ? prev : []).map((sheet) => [sheet?.id, sheet]));
  return (Array.isArray(next) ? next : []).some((sheet) => {
    const before = prevById.get(sheet?.id);
    return (
      (Number(sheet?.row) || 0) > (Number(before?.row) || 0) ||
      (Number(sheet?.column) || 0) > (Number(before?.column) || 0)
    );
  });
}
