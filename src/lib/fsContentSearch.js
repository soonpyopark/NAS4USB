import { base64ToBytes } from './bytes.js';
import { decodeTextBase64 } from './text/textIO.js';

/** Files larger than this are skipped — reading them into the renderer is too costly. */
export const CONTENT_SEARCH_MAX_BYTES = 5 * 1024 * 1024;

const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv',
  'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'env',
  'html', 'htm', 'css', 'scss',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx',
  'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php',
  'sh', 'bat', 'ps1', 'sql',
]);

/** Office/HWP packages: only the parts that hold user-visible text. */
const ZIP_CONTENT_PATTERNS = {
  hwpx: /^Contents\/section\d+\.xml$/i,
  docx: /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i,
  xlsx: /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/i,
  pptx: /^ppt\/(slides\/slide\d+\.xml|notesSlides\/notesSlide\d+\.xml)$/i,
};

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 */
function getEntryExtension(entry) {
  const fromField = entry?.extension;
  if (fromField) return String(fromField).toLowerCase();
  const name = String(entry?.name ?? '');
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 */
export function isContentSearchableEntry(entry) {
  if (!entry || entry.isDirectory) return false;
  const extension = getEntryExtension(entry);
  return (
    PLAIN_TEXT_EXTENSIONS.has(extension) ||
    extension in ZIP_CONTENT_PATTERNS ||
    extension === 'pdf'
  );
}

/**
 * @param {string} value
 */
function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Word processors split a single word across runs, so a space-joined variant alone
 * misses "안녕하세요" written as two runs. Keep both joins and match against either.
 *
 * @param {string} xml
 * @returns {string[]}
 */
function xmlToSearchFragments(xml) {
  const source = String(xml ?? '');
  const joined = decodeXmlEntities(source.replace(/<[^>]*>/g, ''));
  const spaced = decodeXmlEntities(source.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  return [joined.toLowerCase(), spaced.toLowerCase()];
}

/**
 * @param {string[]} parts
 * @returns {string[]}
 */
function partsToSearchFragments(parts) {
  return [parts.join('').toLowerCase(), parts.join(' ').replace(/\s+/g, ' ').toLowerCase()];
}

/**
 * @param {string} relativePath
 * @returns {Promise<string[]>}
 */
async function readPlainTextFragments(relativePath) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  return [decodeTextBase64(base64).toLowerCase()];
}

/**
 * @param {string} relativePath
 * @param {string} extension
 * @param {AbortSignal} [signal]
 * @returns {Promise<string[]>}
 */
async function readZipTextFragments(relativePath, extension, signal) {
  const pattern = ZIP_CONTENT_PATTERNS[extension];
  if (!pattern) return [];

  const base64 = await window.nas4usb.fs.readFile(relativePath);
  if (signal?.aborted) return [];

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(base64ToBytes(base64));

  /** @type {string[]} */
  const fragments = [];
  for (const [path, file] of Object.entries(zip.files)) {
    if (signal?.aborted) return fragments;
    if (file.dir || !pattern.test(path)) continue;
    fragments.push(...xmlToSearchFragments(await file.async('string')));
  }
  return fragments;
}

/**
 * Streams the PDF instead of pulling base64 through IPC, and stops at the first hit.
 *
 * @param {string} relativePath
 * @param {string} needle
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>}
 */
async function pdfContainsText(relativePath, needle, signal) {
  const [{ loadPdfDocument, destroyPdfDocument }, { buildMediaStreamUrl }] = await Promise.all([
    import('./pdf/pdfjs.js'),
    import('./media/streamUrl.js'),
  ]);

  /** @type {import('pdfjs-dist').PDFDocumentProxy | null} */
  let pdf = null;
  try {
    pdf = await loadPdfDocument(buildMediaStreamUrl(relativePath));
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (signal?.aborted) return false;
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const parts = content.items.map((item) => String(item?.str ?? ''));
      if (partsToSearchFragments(parts).some((fragment) => fragment.includes(needle))) {
        return true;
      }
    }
    return false;
  } finally {
    await destroyPdfDocument(pdf);
  }
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry} entry
 * @param {string} needle lowercase query
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>}
 */
export async function entryContentMatches(entry, needle, signal) {
  if (!needle || !isContentSearchableEntry(entry)) return false;
  if ((entry.size ?? 0) > CONTENT_SEARCH_MAX_BYTES) return false;

  const extension = getEntryExtension(entry);

  if (extension === 'pdf') {
    return pdfContainsText(entry.relativePath, needle, signal);
  }

  const fragments = PLAIN_TEXT_EXTENSIONS.has(extension)
    ? await readPlainTextFragments(entry.relativePath)
    : await readZipTextFragments(entry.relativePath, extension, signal);

  if (signal?.aborted) return false;
  return fragments.some((fragment) => fragment.includes(needle));
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} worker
 * @param {AbortSignal} [signal]
 */
async function runPool(items, limit, worker, signal) {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        if (signal?.aborted) return;
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    }),
  );
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} query
 * @param {{
 *   signal?: AbortSignal,
 *   concurrency?: number,
 *   onMatch?: (relativePath: string) => void,
 *   onProgress?: (scanned: number, total: number) => void,
 * }} [options]
 * @returns {Promise<{ matched: string[], total: number }>}
 */
export async function searchEntriesByContent(entries, query, options = {}) {
  const { signal, concurrency = 4, onMatch, onProgress } = options;
  const needle = String(query ?? '').trim().toLowerCase();
  const candidates = (entries ?? []).filter(
    (entry) => isContentSearchableEntry(entry) && (entry.size ?? 0) <= CONTENT_SEARCH_MAX_BYTES,
  );

  if (!needle || candidates.length === 0) {
    return { matched: [], total: candidates.length };
  }

  /** @type {string[]} */
  const matched = [];
  let scanned = 0;

  await runPool(
    candidates,
    concurrency,
    async (entry) => {
      try {
        if (await entryContentMatches(entry, needle, signal)) {
          matched.push(entry.relativePath);
          onMatch?.(entry.relativePath);
        }
      } catch {
        // Unreadable or unsupported file — treat as "no match" and keep scanning.
      } finally {
        scanned += 1;
        onProgress?.(scanned, candidates.length);
      }
    },
    signal,
  );

  return { matched, total: candidates.length };
}
