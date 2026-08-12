import XLSX from 'xlsx-js-style';
import { exportFileName, triggerBrowserDownload } from '../browserDownload.js';

/** @typedef {import('./pdfMarkup.js').PdfMarkupEntry} PdfMarkupEntry */

const HEADER_FILL = 'E2EFDA';
const BORDER_COLOR = 'CCCCCC';

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
  left: { style: 'thin', color: { rgb: BORDER_COLOR } },
  right: { style: 'thin', color: { rgb: BORDER_COLOR } },
};

/**
 * @param {number} pixels
 */
function columnWidthFromPixels(pixels) {
  return (pixels - 5) / 7;
}

/**
 * @param {string | undefined} color
 * @returns {string | null} RRGGBB
 */
export function cssColorToExcelRgb(color) {
  const raw = String(color ?? '').trim();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    const body = hex[1];
    if (body.length === 3) {
      return body
        .split('')
        .map((ch) => `${ch}${ch}`)
        .join('')
        .toUpperCase();
    }
    return body.toUpperCase();
  }

  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  return null;
}

/**
 * @param {string} kind
 */
function annotationLabel(kind) {
  return kind === 'underline' ? 'U' : 'H';
}

/**
 * @param {PdfMarkupEntry} entry
 */
function entrySortKey(entry) {
  const rect = entry.rects?.[0];
  return {
    page: entry.pageNumber || 0,
    top: rect?.top ?? 0,
    left: rect?.left ?? 0,
  };
}

/**
 * Tiny PDF Editor `markup_export.py` layout: 페이지 / 주석(H|U) / 내용.
 *
 * @param {PdfMarkupEntry[]} entries
 * @returns {ArrayBuffer}
 */
export function buildPdfMarkupsXlsxArrayBuffer(entries) {
  const sorted = [...(entries || [])].sort((a, b) => {
    const left = entrySortKey(a);
    const right = entrySortKey(b);
    if (left.page !== right.page) return left.page - right.page;
    if (left.top !== right.top) return left.top - right.top;
    return left.left - right.left;
  });

  /** @type {import('xlsx-js-style').CellObject[][]} */
  const aoa = [
    [
      {
        v: '페이지',
        t: 's',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } },
          border: THIN_BORDER,
          alignment: { vertical: 'top' },
        },
      },
      {
        v: '주석',
        t: 's',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } },
          border: THIN_BORDER,
          alignment: { vertical: 'top' },
        },
      },
      {
        v: '내용',
        t: 's',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } },
          border: THIN_BORDER,
          alignment: { vertical: 'top' },
        },
      },
    ],
  ];

  for (const entry of sorted) {
    const fillRgb = cssColorToExcelRgb(entry.color);
    /** @type {import('xlsx-js-style').CellStyle} */
    const noteStyle = {
      border: THIN_BORDER,
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    if (fillRgb) {
      noteStyle.fill = { patternType: 'solid', fgColor: { rgb: fillRgb } };
    }

    aoa.push([
      {
        v: entry.pageNumber,
        t: 'n',
        s: { border: THIN_BORDER, alignment: { vertical: 'top' } },
      },
      {
        v: annotationLabel(entry.kind),
        t: 's',
        s: noteStyle,
      },
      {
        v: entry.text || '',
        t: 's',
        s: {
          border: THIN_BORDER,
          alignment: { wrapText: true, vertical: 'top' },
        },
      },
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: columnWidthFromPixels(70) },
    { wch: columnWidthFromPixels(50) },
    { wch: columnWidthFromPixels(800) },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '형광펜 밑줄');

  return new Uint8Array(
    XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      cellStyles: true,
    }),
  );
}

/**
 * @param {Date} [date]
 */
function formatExportStamp(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}_${hh}${mi}${ss}`;
}

/**
 * @param {string} pdfFileName
 * @param {Date} [date]
 */
export function pdfMarkupsExportFileName(pdfFileName, date = new Date()) {
  const stem = String(pdfFileName || 'document')
    .replace(/\.pdf$/i, '')
    .trim();
  return exportFileName(`${stem || 'document'}_형광펜_밑줄_${formatExportStamp(date)}`, 'xlsx');
}

/**
 * @param {PdfMarkupEntry[]} entries
 * @param {string} pdfFileName
 */
export function downloadPdfMarkupsXlsx(entries, pdfFileName) {
  const buffer = buildPdfMarkupsXlsxArrayBuffer(entries);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBrowserDownload(pdfMarkupsExportFileName(pdfFileName), blob);
}
