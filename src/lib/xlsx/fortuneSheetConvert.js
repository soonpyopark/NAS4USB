import XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import { getGridBounds, normalizeCellsToRowCol, parseRowColKey, toRowColKey } from './cellAddress.js';

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 12;

/**
 * @param {string | undefined} color
 */
function xlsxRgbToFortuneColor(color) {
  if (!color) return undefined;
  const hex = String(color).replace('#', '').toUpperCase();
  if (hex.length === 8) return `#${hex.slice(2)}`;
  if (hex.length === 6) return `#${hex}`;
  return undefined;
}

/**
 * @param {string | undefined} color
 */
function fortuneColorToXlsxRgb(color) {
  if (!color) return undefined;
  const hex = String(color).replace('#', '').toUpperCase();
  if (hex.length === 6) return `FF${hex}`;
  if (hex.length === 8) return hex;
  return undefined;
}

/**
 * @param {import('xlsx-js-style').CellStyle | Record<string, unknown> | undefined} style
 */
function normalizeXlsxStyle(style) {
  if (!style || typeof style !== 'object') return {};

  /** @type {import('xlsx-js-style').CellStyle} */
  const normalized = { ...style };

  if (!normalized.fill && normalized.patternType) {
    normalized.fill = {
      patternType: normalized.patternType,
      fgColor: normalized.fgColor,
      bgColor: normalized.bgColor,
    };
  }

  return normalized;
}

/**
 * @param {import('xlsx-js-style').WorkBook['Styles']} styles
 * @param {number} xfIndex
 * @param {Array<Record<string, { style: string, color?: { rgb: string } }>>} [bordersOverride]
 */
function composeStyleFromXf(styles, xfIndex, bordersOverride) {
  if (!styles?.CellXf?.[xfIndex]) return undefined;

  const xf = styles.CellXf[xfIndex];
  /** @type {import('xlsx-js-style').CellStyle} */
  const composed = {};

  const fontId = Number(xf.fontId ?? xf.fontid ?? 0);
  const fillId = Number(xf.fillId ?? xf.fillid ?? 0);
  const font = styles.Fonts?.[fontId];
  const fill = styles.Fills?.[fillId];

  if (font && (xf.applyFont || xf.applyfont)) {
    composed.font = { ...font };
  }

  if (fill && fill.patternType && fill.patternType !== 'none' && (xf.applyFill || xf.applyfill)) {
    composed.fill = { ...fill };
  }

  if (xf.alignment || xf.Alignment) {
    composed.alignment = { ...(xf.alignment ?? xf.Alignment) };
  }

  // xlsx-js-style's XLSX.read() leaves workbook.Styles.Borders as empty stub objects — the
  // border XML is written correctly (see applyBorderInfoToWorksheet) but the reader never
  // populates this table — so we always resolve borders from our own xl/styles.xml parse
  // (bordersOverride, see parseBordersFromStylesXml) via the xf's borderId instead.
  const borderId = Number(xf.borderId ?? xf.borderid ?? 0);
  const borderDef = bordersOverride?.[borderId];
  if (borderDef && Object.keys(borderDef).length > 0) {
    composed.border = borderDef;
  }

  return Object.keys(composed).length > 0 ? composed : undefined;
}

/**
 * xlsx-js-style parses `<borders>` from styles.xml into empty placeholder objects on read
 * (workbook.Styles.Borders[i] === {}), so border style/color is otherwise unrecoverable once
 * a file round-trips through XLSX.read(). Parse the raw XML ourselves; array order matches
 * the `borderId` index referenced by cellXfs entries.
 * @param {string} xml
 * @returns {Array<Record<string, { style: string, color?: { rgb: string } }>>}
 */
function parseBordersFromStylesXml(xml) {
  const bordersBlock = xml.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)?.[1] ?? '';
  const borderElements = bordersBlock.match(/<border\b[^>]*>[\s\S]*?<\/border>|<border\b[^>]*\/>/g) ?? [];

  return borderElements.map((element) => {
    /** @type {Record<string, { style: string, color?: { rgb: string } }>} */
    const sides = {};
    for (const sideName of ['left', 'right', 'top', 'bottom']) {
      const sideMatch = element.match(
        new RegExp(`<${sideName}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${sideName}>)`),
      );
      if (!sideMatch) continue;
      const style = sideMatch[1]?.match(/\bstyle="([^"]+)"/)?.[1];
      if (!style) continue;
      const rgb = sideMatch[2]?.match(/<color\b[^>]*\brgb="([^"]+)"/)?.[1];
      sides[sideName] = rgb ? { style, color: { rgb } } : { style };
    }
    return sides;
  });
}

/**
 * @param {string} xml
 */
function parseStyleIndexMapFromSheetXml(xml) {
  /** @type {Map<string, number>} */
  const map = new Map();
  const cellTagPattern = /<c\b([^>]*)\/?>/g;

  for (const match of xml.matchAll(cellTagPattern)) {
    const attrs = match[1] ?? '';
    const address = attrs.match(/\br="([^"]+)"/)?.[1];
    if (!address) continue;
    const styleIndex = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
    map.set(address, styleIndex);
  }

  return map;
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {import('xlsx-js-style').WorkBook} workbook
 */
async function buildStyleIndexMaps(buffer, workbook) {
  /** @type {Map<string, Map<string, number>>} */
  const sheetStyleIndexMaps = new Map();
  const zip = await JSZip.loadAsync(buffer);

  for (let index = 0; index < workbook.SheetNames.length; index += 1) {
    const sheetName = workbook.SheetNames[index];
    const xml = await zip.file(`xl/worksheets/sheet${index + 1}.xml`)?.async('string');
    sheetStyleIndexMaps.set(sheetName, xml ? parseStyleIndexMapFromSheetXml(xml) : new Map());
  }

  const stylesXml = await zip.file('xl/styles.xml')?.async('string');
  const borders = stylesXml ? parseBordersFromStylesXml(stylesXml) : [];

  return { sheetStyleIndexMaps, borders };
}

/**
 * @param {import('xlsx-js-style').WorkBook} workbook
 * @param {import('xlsx-js-style').CellObject | undefined} cell
 * @param {string} address
 * @param {Map<string, number>} styleIndexMap
 * @param {Array<Record<string, { style: string, color?: { rgb: string } }>>} [borders]
 */
function resolveXlsxCellStyle(workbook, cell, address, styleIndexMap, borders) {
  const styles = workbook.Styles;
  if (!styles || !cell) return undefined;

  const xfIndex = styleIndexMap.get(address);
  if (xfIndex != null) {
    return composeStyleFromXf(styles, xfIndex, borders) ?? normalizeXlsxStyle(cell.s);
  }

  if (typeof cell.s === 'number') {
    return composeStyleFromXf(styles, cell.s, borders);
  }

  return normalizeXlsxStyle(cell.s);
}

/**
 * @param {import('xlsx-js-style').CellStyle | undefined} style
 */
function extractFortuneStyleFromXlsx(style) {
  const normalized = normalizeXlsxStyle(style);
  if (!normalized) return {};

  /** @type {Record<string, string | number>} */
  const fortuneStyle = {};

  const bg = xlsxRgbToFortuneColor(style.fill?.fgColor?.rgb ?? style.fgColor?.rgb);
  if (bg) fortuneStyle.bg = bg;

  const fc = xlsxRgbToFortuneColor(style.font?.color?.rgb);
  if (fc) fortuneStyle.fc = fc;

  if (style.font?.sz) fortuneStyle.fs = style.font.sz;
  if (style.font?.bold) fortuneStyle.bl = 1;
  if (style.font?.italic) fortuneStyle.it = 1;
  if (style.font?.underline) fortuneStyle.un = 1;
  if (style.font?.strike) fortuneStyle.cl = 1;

  if (style.alignment?.horizontal === 'center') fortuneStyle.ht = 0;
  else if (style.alignment?.horizontal === 'left' || style.alignment?.horizontal === 'general') {
    fortuneStyle.ht = 1;
  } else if (style.alignment?.horizontal === 'right') {
    fortuneStyle.ht = 2;
  }

  if (style.alignment?.vertical === 'center') fortuneStyle.vt = 0;
  else if (style.alignment?.vertical === 'top') fortuneStyle.vt = 1;
  else if (style.alignment?.vertical === 'bottom') fortuneStyle.vt = 2;

  if (style.alignment?.wrapText) fortuneStyle.tb = '2';

  return fortuneStyle;
}

/**
 * @param {import('@fortune-sheet/core').Cell | null | undefined} cell
 */
function buildXlsxStyleFromFortuneCell(cell) {
  if (!cell) return undefined;

  /** @type {import('xlsx-js-style').CellStyle} */
  const style = {};
  let hasStyle = false;

  const fillRgb = fortuneColorToXlsxRgb(cell.bg);
  if (fillRgb) {
    style.fill = { patternType: 'solid', fgColor: { rgb: fillRgb } };
    hasStyle = true;
  }

  /** @type {import('xlsx-js-style').CellStyle['font']} */
  const font = {};
  let hasFont = false;

  const fontRgb = fortuneColorToXlsxRgb(cell.fc);
  if (fontRgb) {
    font.color = { rgb: fontRgb };
    hasFont = true;
  }
  if (cell.fs) {
    font.sz = cell.fs;
    hasFont = true;
  }
  if (cell.bl) {
    font.bold = true;
    hasFont = true;
  }
  if (cell.it) {
    font.italic = true;
    hasFont = true;
  }
  if (cell.un) {
    font.underline = true;
    hasFont = true;
  }
  if (cell.cl) {
    font.strike = true;
    hasFont = true;
  }
  if (hasFont) {
    style.font = font;
    hasStyle = true;
  }

  /** @type {import('xlsx-js-style').CellStyle['alignment']} */
  const alignment = {};
  let hasAlignment = false;

  if (cell.ht === 0) {
    alignment.horizontal = 'center';
    hasAlignment = true;
  } else if (cell.ht === 1) {
    alignment.horizontal = 'left';
    hasAlignment = true;
  } else if (cell.ht === 2) {
    alignment.horizontal = 'right';
    hasAlignment = true;
  }

  if (cell.vt === 0) {
    alignment.vertical = 'center';
    hasAlignment = true;
  } else if (cell.vt === 1) {
    alignment.vertical = 'top';
    hasAlignment = true;
  } else if (cell.vt === 2) {
    alignment.vertical = 'bottom';
    hasAlignment = true;
  }

  if (cell.tb === '2' || cell.tb === 2) {
    alignment.wrapText = true;
    hasAlignment = true;
  }

  if (hasAlignment) {
    style.alignment = alignment;
    hasStyle = true;
  }

  return hasStyle ? style : undefined;
}

/**
 * @param {import('@fortune-sheet/core').Cell | null | undefined} cell
 */
function fortuneCellHasStyle(cell) {
  if (!cell) return false;
  return Boolean(
    cell.bg ||
      cell.fc ||
      cell.fs ||
      cell.bl ||
      cell.it ||
      cell.un ||
      cell.cl ||
      cell.ht != null ||
      cell.vt != null ||
      cell.tb != null,
  );
}

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
 * @param {import('xlsx-js-style').CellObject | undefined} cell
 * @param {import('xlsx-js-style').CellStyle | undefined} resolvedStyle
 * @returns {import('@fortune-sheet/core').Cell | null}
 */
function xlsxCellToFortuneCell(cell, resolvedStyle) {
  if (!cell) return null;

  const styleProps = extractFortuneStyleFromXlsx(resolvedStyle);
  const hasValue = cell.v != null || cell.f != null;
  const hasStyle = Object.keys(styleProps).length > 0;
  if (!hasValue && !hasStyle) return null;

  /** @type {import('@fortune-sheet/core').Cell} */
  const fortuneCell = {
    v: cell.v ?? '',
    m: cell.w ?? (cell.v == null ? '' : String(cell.v)),
    ...styleProps,
  };

  if (cell.f) {
    fortuneCell.f = cell.f;
  }

  return fortuneCell;
}

/**
 * @param {import('xlsx-js-style').WorkSheet} sheet
 * @returns {import('@fortune-sheet/core').SheetConfig | undefined}
 */
function extractSheetConfigFromXlsx(sheet, workbook, styleIndexMap, borders) {
  /** @type {import('@fortune-sheet/core').SheetConfig} */
  const config = {};

  const cols = sheet['!cols'];
  if (Array.isArray(cols)) {
    /** @type {Record<string, number>} */
    const columnlen = {};
    cols.forEach((col, index) => {
      if (!col) return;
      const width =
        col.wpx ??
        (col.wch != null ? Math.round(Number(col.wch) * 7) : null) ??
        (col.width != null ? Math.round(Number(col.width) * 7) : null);
      if (width != null && width > 0) columnlen[String(index)] = Math.round(width);
    });
    if (Object.keys(columnlen).length > 0) config.columnlen = columnlen;
  }

  const rows = sheet['!rows'];
  if (Array.isArray(rows)) {
    /** @type {Record<string, number>} */
    const rowlen = {};
    rows.forEach((row, index) => {
      if (!row) return;
      const height =
        row.hpx ??
        (row.hpt != null ? Math.round(Number(row.hpt) * 4 / 3) : null);
      if (height != null && height > 0) rowlen[String(index)] = Math.round(height);
    });
    if (Object.keys(rowlen).length > 0) config.rowlen = rowlen;
  }

  const merges = sheet['!merges'];
  if (Array.isArray(merges)) {
    /** @type {NonNullable<import('@fortune-sheet/core').SheetConfig['merge']>} */
    const merge = {};
    for (const range of merges) {
      if (!range?.s || !range?.e) continue;
      const key = `${range.s.r}_${range.s.c}`;
      merge[key] = {
        r: range.s.r,
        c: range.s.c,
        rs: range.e.r - range.s.r + 1,
        cs: range.e.c - range.s.c + 1,
      };
    }
    if (Object.keys(merge).length > 0) config.merge = merge;
  }

  const borderInfo = extractBorderInfoFromXlsxSheet(sheet, workbook, styleIndexMap, borders);
  if (borderInfo?.length) config.borderInfo = borderInfo;

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * @param {string | undefined} style
 */
function mapXlsxBorderStyleToFortune(style) {
  const normalized = String(style ?? 'thin').toLowerCase();
  if (normalized === 'hair') return 2;
  if (normalized === 'dotted') return 3;
  if (normalized === 'dashdot') return 5;
  if (normalized === 'dashed') return 4;
  if (normalized === 'medium') return 8;
  if (normalized === 'double') return 7;
  if (normalized === 'thick') return 13;
  return 1;
}

/**
 * @param {number} style
 */
function mapFortuneBorderStyleToXlsx(style) {
  switch (Number(style)) {
    case 2:
      return 'hair';
    case 3:
      return 'dotted';
    case 4:
      return 'dashed';
    case 5:
      return 'dashDot';
    case 7:
      return 'double';
    case 8:
      return 'medium';
    case 13:
      return 'thick';
    default:
      return 'thin';
  }
}

/**
 * @param {{ style?: number | string, color?: string } | undefined} side
 */
function fortuneBorderSideToXlsx(side) {
  if (!side) return undefined;
  const rgb = fortuneColorToXlsxRgb(side.color?.replace(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i, (_, r, g, b) => {
    return `#${Number(r).toString(16).padStart(2, '0')}${Number(g).toString(16).padStart(2, '0')}${Number(b).toString(16).padStart(2, '0')}`;
  }));
  if (!rgb) return undefined;
  return {
    style: mapFortuneBorderStyleToXlsx(side.style ?? 1),
    color: { rgb },
  };
}

/**
 * @param {import('xlsx-js-style').BorderSide | undefined} side
 */
function xlsxBorderSideToFortune(side) {
  if (!side?.style) return undefined;
  const color = xlsxRgbToFortuneColor(side.color?.rgb) ?? '#000000';
  return {
    style: mapXlsxBorderStyleToFortune(side.style),
    color,
  };
}

/**
 * @param {import('xlsx-js-style').WorkSheet} sheet
 * @param {import('xlsx-js-style').WorkBook} workbook
 * @param {Map<string, number>} styleIndexMap
 */
function extractBorderInfoFromXlsxSheet(sheet, workbook, styleIndexMap, borders) {
  /** @type {import('@fortune-sheet/core').SheetConfig['borderInfo']} */
  const borderInfo = [];

  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const decoded = XLSX.utils.decode_cell(address);
    const resolvedStyle = resolveXlsxCellStyle(workbook, cell, address, styleIndexMap, borders);
    const border = resolvedStyle?.border;
    if (!border) continue;

    /** @type {Record<string, { style: number, color: string }>} */
    const value = {
      row_index: decoded.r,
      col_index: decoded.c,
    };
    let hasBorder = false;

    const top = xlsxBorderSideToFortune(border.top);
    const bottom = xlsxBorderSideToFortune(border.bottom);
    const left = xlsxBorderSideToFortune(border.left);
    const right = xlsxBorderSideToFortune(border.right);

    if (top) {
      value.t = top;
      hasBorder = true;
    }
    if (bottom) {
      value.b = bottom;
      hasBorder = true;
    }
    if (left) {
      value.l = left;
      hasBorder = true;
    }
    if (right) {
      value.r = right;
      hasBorder = true;
    }

    if (hasBorder) {
      borderInfo.push({ rangeType: 'cell', value });
    }
  }

  return borderInfo;
}

/**
 * @param {import('xlsx-js-style').WorkSheet} worksheet
 * @param {import('@fortune-sheet/core').SheetConfig['borderInfo']} borderInfo
 */
function applyBorderInfoToWorksheet(worksheet, borderInfo) {
  for (const item of borderInfo ?? []) {
    if (item?.rangeType !== 'cell' || !item.value) continue;

    const { row_index, col_index, l, r, t, b } = item.value;
    if (row_index == null || col_index == null) continue;

    const address = XLSX.utils.encode_cell({ r: row_index, c: col_index });
    if (!worksheet[address]) {
      worksheet[address] = { v: '', t: 's' };
    }

    /** @type {import('xlsx-js-style').CellObject} */
    const cell = worksheet[address];
    cell.s = cell.s && typeof cell.s === 'object' ? { ...cell.s } : {};
    /** @type {import('xlsx-js-style').CellStyle['border']} */
    const border = { ...(cell.s.border ?? {}) };

    const top = fortuneBorderSideToXlsx(t);
    const bottom = fortuneBorderSideToXlsx(b);
    const left = fortuneBorderSideToXlsx(l);
    const right = fortuneBorderSideToXlsx(r);
    if (top) border.top = top;
    if (bottom) border.bottom = bottom;
    if (left) border.left = left;
    if (right) border.right = right;

    if (Object.keys(border).length > 0) {
      cell.s.border = border;
    }
  }
}

/**
 * @param {import('xlsx-js-style').WorkSheet} worksheet
 * @param {import('@fortune-sheet/core').SheetConfig | undefined} config
 */
function applySheetLayoutToWorksheet(worksheet, config) {
  if (!config) return;

  if (config.columnlen && Object.keys(config.columnlen).length > 0) {
    const maxCol = Math.max(...Object.keys(config.columnlen).map(Number));
    /** @type {import('xlsx-js-style').ColInfo[]} */
    const cols = [];
    for (let c = 0; c <= maxCol; c += 1) {
      const width = config.columnlen[String(c)];
      cols[c] = width != null ? { wpx: width } : {};
    }
    worksheet['!cols'] = cols;
  }

  if (config.rowlen && Object.keys(config.rowlen).length > 0) {
    const maxRow = Math.max(...Object.keys(config.rowlen).map(Number));
    /** @type {import('xlsx-js-style').RowInfo[]} */
    const rows = [];
    for (let r = 0; r <= maxRow; r += 1) {
      const height = config.rowlen[String(r)];
      rows[r] = height != null ? { hpx: height } : {};
    }
    worksheet['!rows'] = rows;
  }

  if (config.merge) {
    worksheet['!merges'] = Object.values(config.merge).map((entry) => ({
      s: { r: entry.r, c: entry.c },
      e: { r: entry.r + entry.rs - 1, c: entry.c + entry.cs - 1 },
    }));
  }

  applyBorderInfoToWorksheet(worksheet, config.borderInfo);
}

/**
 * @param {import('xlsx-js-style').WorkSheet} sheet
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
 * FortuneSheet's own merge action (see `refreshLocalMergeData` in @fortune-sheet/core)
 * stamps an `mc` marker onto every covered cell, not just the `config.merge` bookkeeping
 * map — the renderer relies on that per-cell marker to know a cell belongs to a merged
 * range. Plain XLSX `!merges` only gives us `config.merge`, so without this backfill the
 * sheet reports the merge in its config but renders every cell unmerged.
 * @param {import('@fortune-sheet/core').CellWithRowAndCol[]} celldata
 * @param {NonNullable<import('@fortune-sheet/core').SheetConfig['merge']>} merge
 */
function applyMergeMarkersToCelldata(celldata, merge) {
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
 * @param {import('xlsx-js-style').WorkSheet} sheet
 * @param {string} name
 * @param {string} id
 * @param {number} order
 * @param {boolean} isActive
 * @param {import('xlsx-js-style').WorkBook} workbook
 * @param {Map<string, number>} styleIndexMap
 * @returns {import('@fortune-sheet/core').Sheet}
 */
function xlsxSheetToFortuneSheet(sheet, name, id, order, isActive, workbook, styleIndexMap, borders) {
  const bounds = getSheetBounds(sheet);
  /** @type {import('@fortune-sheet/core').CellWithRowAndCol[]} */
  const celldata = [];

  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const decoded = XLSX.utils.decode_cell(address);
    const resolvedStyle = resolveXlsxCellStyle(workbook, cell, address, styleIndexMap, borders);
    const fortuneCell = xlsxCellToFortuneCell(cell, resolvedStyle);
    if (!fortuneCell) continue;
    celldata.push({ r: decoded.r, c: decoded.c, v: fortuneCell });
  }

  const config = extractSheetConfigFromXlsx(sheet, workbook, styleIndexMap, borders);
  if (config?.merge) {
    applyMergeMarkersToCelldata(celldata, config.merge);
  }

  return {
    name,
    id,
    order,
    status: isActive ? 1 : 0,
    row: bounds.rows,
    column: bounds.cols,
    celldata,
    config,
  };
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {Promise<import('@fortune-sheet/core').Sheet[]>}
 */
export async function xlsxBufferToFortuneSheets(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellNF: true });
  const { sheetStyleIndexMaps, borders } = await buildStyleIndexMaps(buffer, workbook);

  return workbook.SheetNames.map((name, index) =>
    xlsxSheetToFortuneSheet(
      workbook.Sheets[name] ?? {},
      name,
      String(index),
      index,
      index === 0,
      workbook,
      sheetStyleIndexMaps.get(name) ?? new Map(),
      borders,
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
 * @param {import('@fortune-sheet/core').Cell | null | undefined} cell
 */
function fortuneCellToXlsxType(cell) {
  if (cell?.f) return undefined;
  if (typeof cell?.v === 'number') return 'n';
  if (typeof cell?.v === 'boolean') return 'b';
  return 's';
}

/**
 * @param {import('@fortune-sheet/core').Sheet} sheet
 * @returns {import('xlsx-js-style').WorkSheet}
 */
function fortuneSheetToXlsxWorksheet(sheet) {
  /** @type {import('xlsx-js-style').WorkSheet} */
  const worksheet = {};
  const matrix = sheetToMatrix(sheet);
  let maxRow = 0;
  let maxCol = 0;

  matrix.forEach((row, rowIndex) => {
    if (!row) return;
    row.forEach((cell, colIndex) => {
      if (!cell) return;
      const text = readCellText(cell);
      const hasStyle = fortuneCellHasStyle(cell);
      if (text === '' && !cell.f && !hasStyle) return;

      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      /** @type {import('xlsx-js-style').CellObject} */
      const xlsxCell = {
        v: cell.v ?? text,
        t: fortuneCellToXlsxType(cell) ?? 's',
      };

      if (cell.f) xlsxCell.f = cell.f;
      if (cell.m != null) xlsxCell.w = String(cell.m);

      const style = buildXlsxStyleFromFortuneCell(cell);
      if (style) xlsxCell.s = style;

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

  applySheetLayoutToWorksheet(worksheet, sheet.config);

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

  return new Uint8Array(
    XLSX.write(workbook, {
      bookType,
      type: 'array',
      cellStyles: true,
    }),
  );
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
