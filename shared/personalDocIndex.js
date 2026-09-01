/** Personal-folder full-text index: Office, PDF, HWP, TipTap, text. */

export const PERSONAL_DOC_INDEX_DIR = '.nas4usb/doc-index';

/** Shared-folder index database key (`__share.db`). */
export const SHARE_DOC_INDEX_KEY = '__share';

/** Bump when indexed file types or parsers change so old DBs rebuild. */
export const PERSONAL_DOC_INDEX_FORMAT = 5;

/** Folders that must never be walked (trash, document history, explorer-hidden). */
export const PERSONAL_DOC_INDEX_SKIP_DIRS = [
  '__trash',
  '__favorites',
  'file-history',
  'hwpx-history',
];

export const PERSONAL_DOC_EXTENSIONS = {
  excel: ['.xlsx', '.xlsm', '.xls', '.csv'],
  hwp: ['.hwp', '.hwpx'],
  docx: ['.docx', '.doc', '.docm'],
  ppt: ['.pptx', '.ppt', '.pptm'],
  pdf: ['.pdf'],
  tiptap: ['.tiptap'],
  text: ['.txt', '.md', '.markdown', '.html', '.htm', '.sql'],
};

export const PERSONAL_DOC_ALL_EXTENSIONS = [
  ...PERSONAL_DOC_EXTENSIONS.excel,
  ...PERSONAL_DOC_EXTENSIONS.hwp,
  ...PERSONAL_DOC_EXTENSIONS.docx,
  ...PERSONAL_DOC_EXTENSIONS.ppt,
  ...PERSONAL_DOC_EXTENSIONS.pdf,
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
  if (PERSONAL_DOC_EXTENSIONS.docx.some((ext) => lower.endsWith(ext))) return 'docx';
  if (PERSONAL_DOC_EXTENSIONS.ppt.some((ext) => lower.endsWith(ext))) return 'ppt';
  if (PERSONAL_DOC_EXTENSIONS.pdf.some((ext) => lower.endsWith(ext))) return 'pdf';
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

/**
 * @param {string} [name]
 */
export function isPersonalDocIndexSkipDir(name) {
  const base = String(name ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  if (!base || base.startsWith('.') || base.startsWith('~$')) return true;
  if (base.endsWith('.tiptap.assets') || base.endsWith('.assets')) return true;
  return PERSONAL_DOC_INDEX_SKIP_DIRS.includes(base.toLowerCase())
    || PERSONAL_DOC_INDEX_SKIP_DIRS.includes(base);
}

/**
 * True when any path segment is trash, history, or another skipped folder.
 * @param {string} [relativePath]
 */
export function isPersonalDocIndexSkipPath(relativePath) {
  const parts = String(relativePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  return parts.some((part) => isPersonalDocIndexSkipDir(part));
}

