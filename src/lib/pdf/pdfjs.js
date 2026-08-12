// Use legacy build: Electron 33 / Chromium lacks Map.getOrInsertComputed,
// which modern pdfjs-dist 6.x requires without a polyfill.
import {
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export { PasswordResponses };

let workerReady = false;

/**
 * pdf.js fetches fixed names (jbig2.wasm, openjpeg.wasm, …) under wasmUrl.
 * Vite `?url` hashing breaks that, so assets are copied to public/pdfjs/ by
 * scripts/prepare-pdfjs-assets.mjs.
 *
 * Must be an absolute http(s) URL: with useWorkerFetch the worker calls
 * fetch(url) and resolves relative paths against the worker script, not the
 * page — so `./pdfjs/cmaps/` would 404 and CJK/CID text renders blank.
 * Prefer location.origin so BASE_URL `./` never yields a worker-relative path.
 *
 * @param {string} subpath trailing-slash folder under public/pdfjs/
 */
function pdfjsAssetBase(subpath) {
  const base = import.meta.env.BASE_URL || './';
  // Vite portable builds use `./`; treat that as site root for absolute URLs.
  const rootPath = base === './' || base === '.' ? '/' : base.endsWith('/') ? base : `${base}/`;
  const origin =
    typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? location.origin
      : 'http://127.0.0.1';
  return new URL(`pdfjs/${subpath}`, `${origin}${rootPath}`).href;
}

function absoluteWorkerSrc(workerUrl) {
  if (typeof workerUrl !== 'string' || !workerUrl) return workerUrl;
  if (/^(https?:|blob:|data:)/i.test(workerUrl)) return workerUrl;
  const origin =
    typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? location.origin
      : 'http://127.0.0.1';
  const baseUri =
    typeof document !== 'undefined' && document.baseURI ? document.baseURI : `${origin}/`;
  return new URL(workerUrl, baseUri).href;
}

export function ensurePdfjsWorker() {
  if (workerReady) return;
  GlobalWorkerOptions.workerSrc = absoluteWorkerSrc(pdfWorkerSrc);
  workerReady = true;
}

/**
 * @param {string} url
 * @param {{
 *   password?: string,
 *   onPasswordNeed?: (reason: number) => Promise<string | null | undefined>,
 * }} [options]
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPdfDocument(url, options = {}) {
  ensurePdfjsWorker();
  const wasmUrl = pdfjsAssetBase('wasm/');
  const cMapUrl = pdfjsAssetBase('cmaps/');
  const standardFontDataUrl = pdfjsAssetBase('standard_fonts/');
  const initialPassword =
    typeof options.password === 'string' && options.password ? options.password : undefined;

  const loadingTask = getDocument({
    url,
    ...(initialPassword ? { password: initialPassword } : {}),
    withCredentials: true,
    useSystemFonts: true,
    // pdf.js 6.x WasmImage: when jbig2.wasm init fails, Promise.race can settle
    // with null before jbig2_nowasm_fallback.js finishes → blank scanned pages
    // ("JBig2 failed to initialize" / "Dependent image isn't ready yet").
    // Force the JS decoders (still loaded from wasmUrl/*_nowasm_fallback.js).
    useWasm: false,
    useWorkerFetch: true,
    wasmUrl,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
  });

  if (typeof options.onPasswordNeed === 'function') {
    loadingTask.onPassword = (updatePassword, reason) => {
      void Promise.resolve(options.onPasswordNeed(reason))
        .then((password) => {
          if (password == null || password === '') {
            updatePassword(new Error('PasswordCancelled'));
            return;
          }
          updatePassword(String(password));
        })
        .catch((err) => {
          updatePassword(err instanceof Error ? err : new Error(String(err)));
        });
    };
  }

  return loadingTask.promise;
}

/**
 * pdf.js 6 removed PDFDocumentProxy.destroy() — tear down via loadingTask.
 * @param {import('pdfjs-dist').PDFDocumentProxy | null | undefined} pdf
 */
export async function destroyPdfDocument(pdf) {
  if (!pdf) return;
  try {
    const loadingTask = pdf.loadingTask;
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      await loadingTask.destroy();
      return;
    }
    if (typeof pdf.cleanup === 'function') {
      await pdf.cleanup();
    }
  } catch {
    // ignore — viewer is closing
  }
}

/**
 * @typedef {{
 *   pageNumber: number,
 *   pageIndex: number,
 *   query: string,
 *   itemIndex: number,
 *   offsetInItem: number,
 *   transform: number[],
 *   width: number,
 *   height: number,
 *   str: string,
 * }} PdfTextMatch
 */

/**
 * Search PDF text content across all pages (case-insensitive).
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {string} query
 * @returns {Promise<PdfTextMatch[]>}
 */
export async function searchPdfDocument(pdf, query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return [];

  /** @type {PdfTextMatch[]} */
  const matches = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (!item || typeof item.str !== 'string' || !item.str) continue;

      const haystack = item.str.toLowerCase();
      let from = 0;
      while (from < haystack.length) {
        const found = haystack.indexOf(normalized, from);
        if (found === -1) break;

        const transform = Array.isArray(item.transform) ? item.transform.slice() : [1, 0, 0, 1, 0, 0];
        const itemWidth = Number(item.width) || 0;
        const itemHeight = Number(item.height) || Math.abs(transform[3] || 12);
        const ratio = item.str.length > 0 ? found / item.str.length : 0;
        const matchWidth =
          item.str.length > 0 ? (normalized.length / item.str.length) * itemWidth : itemWidth;

        transform[4] = (transform[4] ?? 0) + ratio * itemWidth;

        matches.push({
          pageNumber,
          pageIndex: pageNumber - 1,
          query: normalized,
          itemIndex,
          offsetInItem: found,
          transform,
          width: matchWidth || Math.max(8, itemWidth * 0.1),
          height: itemHeight || 12,
          str: item.str.slice(found, found + normalized.length),
        });

        from = found + Math.max(1, normalized.length);
      }
    }
  }

  return matches;
}

/**
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} [rotation]
 */
export function getPageBaseSize(page, rotation = 0) {
  const viewport = page.getViewport({ scale: 1, rotation });
  return { width: viewport.width, height: viewport.height };
}

/**
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} containerWidth
 * @param {number} [rotation]
 */
export function computeFitWidthScale(page, containerWidth, rotation = 0) {
  const { width } = getPageBaseSize(page, rotation);
  if (!width) return 1;
  return Math.max(0.1, containerWidth / width);
}

/**
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {{ width: number, height: number }} containerSize
 * @param {number} [rotation]
 */
export function computeFitPageScale(page, containerSize, rotation = 0) {
  const { width, height } = getPageBaseSize(page, rotation);
  if (!width || !height) return 1;
  const sx = containerSize.width / width;
  const sy = containerSize.height / height;
  return Math.max(0.1, Math.min(sx, sy));
}

/**
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} containerHeight
 * @param {number} [rotation]
 */
export function computeFitHeightScale(page, containerHeight, rotation = 0) {
  const { height } = getPageBaseSize(page, rotation);
  if (!height) return 1;
  return Math.max(0.1, containerHeight / height);
}

export const PDF_MIN_SCALE = 0.25;
export const PDF_MAX_SCALE = 4;
export const PDF_ZOOM_STEP = 1.2;

/**
 * @param {number} scale
 * @param {'in' | 'out'} direction
 */
export function stepZoomScale(scale, direction) {
  const next = direction === 'in' ? scale * PDF_ZOOM_STEP : scale / PDF_ZOOM_STEP;
  return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, next));
}
