// Use legacy build: Electron 33 / Chromium lacks Map.getOrInsertComputed,
// which modern pdfjs-dist 6.x requires without a polyfill.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import pdfWasmAsset from 'pdfjs-dist/wasm/jbig2.wasm?url';

let workerReady = false;

/** Trailing-slash base URL for pdf.js wasm/ (jbig2, openjpeg, …). */
function pdfWasmBaseUrl() {
  const idx = pdfWasmAsset.lastIndexOf('/');
  return idx >= 0 ? pdfWasmAsset.slice(0, idx + 1) : './';
}

export function ensurePdfjsWorker() {
  if (workerReady) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  workerReady = true;
}

/**
 * @param {string} url
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPdfDocument(url) {
  ensurePdfjsWorker();
  const loadingTask = getDocument({
    url,
    withCredentials: true,
    useSystemFonts: true,
    useWasm: true,
    wasmUrl: pdfWasmBaseUrl(),
  });
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
