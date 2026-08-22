/** Personal-folder full-text index: HWP/HWPX, Excel, TipTap, plain text. */

export const PERSONAL_DOC_INDEX_DIR = '.nas4usb/doc-index';

/** Shared-folder index database key (`__share.db`). */
export const SHARE_DOC_INDEX_KEY = '__share';

/** Bump when indexed file types or parsers change so old DBs rebuild. */
export const PERSONAL_DOC_INDEX_FORMAT = 2;

export const PERSONAL_DOC_EXTENSIONS = {
  excel: ['.xlsx', '.xlsm', '.xls'],
  hwp: ['.hwp', '.hwpx'],
  tiptap: ['.tiptap'],
  text: ['.txt', '.md', '.markdown', '.csv'],
};

export const PERSONAL_DOC_ALL_EXTENSIONS = [
  ...PERSONAL_DOC_EXTENSIONS.excel,
  ...PERSONAL_DOC_EXTENSIONS.hwp,
  ...PERSONAL_DOC_EXTENSIONS.tiptap,
  ...PERSONAL_DOC_EXTENSIONS.text,
];

export const PERSONAL_DOC_MAX_FILE_BYTES = 80 * 1024 * 1024;
export const PERSONAL_DOC_SEARCH_LIMIT = 300;

/**
 * @param {string} [fileName]
 */
export function personalDocTypeForName(fileName) {
  const lower = String(fileName ?? '').toLowerCase();
  if (lower.endsWith('.fortune.json') || lower.endsWith('.tiptap.assets')) return null;
  if (PERSONAL_DOC_EXTENSIONS.excel.some((ext) => lower.endsWith(ext))) return 'excel';
  if (PERSONAL_DOC_EXTENSIONS.hwp.some((ext) => lower.endsWith(ext))) return 'hwp';
  if (PERSONAL_DOC_EXTENSIONS.tiptap.some((ext) => lower.endsWith(ext))) return 'tiptap';
  if (PERSONAL_DOC_EXTENSIONS.text.some((ext) => lower.endsWith(ext))) return 'text';
  return null;
}

/**
 * @param {string} [fileName]
 */
export function isPersonalDocIndexFileName(fileName) {
  return personalDocTypeForName(fileName) != null;
}

