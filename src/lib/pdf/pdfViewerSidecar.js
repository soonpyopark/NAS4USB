import { base64ToBytes, bytesToBase64 } from '../bytes.js';
import { isExternalFolderPath } from '../../../shared/externalFolders.js';
import {
  PDF_VIEWER_SIDECAR_FORMAT,
  PDF_VIEWER_SIDECAR_VERSION,
  getPdfPathForViewerSidecar,
  getPdfViewerSidecarPath,
  getPdfViewerStateCacheRelativePath,
  isCanonicalPdfViewerSidecarRelativePath,
  isPdfViewerSidecarRelativePath,
  normalizeRelativePath,
} from '../../../shared/pdfViewerSidecar.js';

/**
 * @typedef {{
 *   page?: number,
 *   zoomMode?: 'fitWidth' | 'fitHeight' | 'fitPage' | 'custom',
 *   customScale?: number,
 *   rotation?: number,
 *   twoPageView?: boolean,
 * }} PdfViewerViewState
 *
 * @typedef {{
 *   pageNumber: number,
 *   kind: 'highlight' | 'underline',
 *   pdfRect: [number, number, number, number],
 *   text?: string,
 * }} PdfRemovedAnnotTarget
 *
 * @typedef {{
 *   format: string,
 *   version: number,
 *   exportedAt?: string,
 *   view: PdfViewerViewState,
 *   markups: import('./pdfMarkup.js').PdfMarkupEntry[],
 *   removed: PdfRemovedAnnotTarget[],
 *   marksComplete?: boolean,
 * }} PdfViewerSidecarPayload
 */

/**
 * @param {unknown} value
 * @returns {import('./pdfMarkup.js').PdfMarkupEntry | null}
 */
function normalizeMarkupEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const entry = /** @type {Record<string, unknown>} */ (value);
  const pageNumber = Number(entry.pageNumber);
  const kind = entry.kind === 'underline' ? 'underline' : entry.kind === 'highlight' ? 'highlight' : null;
  if (!kind || !Number.isFinite(pageNumber) || pageNumber < 1) return null;
  if (!Array.isArray(entry.rects) || entry.rects.length === 0) return null;

  /** @type {Array<{ left: number, top: number, width: number, height: number }>} */
  const rects = [];
  for (const rect of entry.rects) {
    if (!rect || typeof rect !== 'object') continue;
    const box = /** @type {Record<string, unknown>} */ (rect);
    const left = Number(box.left);
    const top = Number(box.top);
    const width = Number(box.width);
    const height = Number(box.height);
    if (![left, top, width, height].every((n) => Number.isFinite(n))) continue;
    if (width < 0.5 || height < 0.5) continue;
    rects.push({ left, top, width, height });
  }
  if (!rects.length) return null;

  const id =
    typeof entry.id === 'string' && entry.id.trim()
      ? entry.id.trim()
      : `saved-${pageNumber}-${Math.random().toString(36).slice(2, 8)}`;

  /** @type {[number, number, number, number] | undefined} */
  let pdfRect;
  if (Array.isArray(entry.pdfRect) && entry.pdfRect.length >= 4) {
    const nums = entry.pdfRect.slice(0, 4).map(Number);
    if (nums.every((n) => Number.isFinite(n))) {
      pdfRect = [
        Math.min(nums[0], nums[2]),
        Math.min(nums[1], nums[3]),
        Math.max(nums[0], nums[2]),
        Math.max(nums[1], nums[3]),
      ];
    }
  }

  return {
    id,
    pageNumber: Math.round(pageNumber),
    kind,
    color: typeof entry.color === 'string' && entry.color ? entry.color : '#fff59d',
    text: typeof entry.text === 'string' ? entry.text : `(${Math.round(pageNumber)}페이지)`,
    rects,
    source: entry.source === 'pdf' ? 'pdf' : 'saved',
    ...(pdfRect ? { pdfRect } : {}),
  };
}

/**
 * @param {unknown} value
 * @returns {PdfRemovedAnnotTarget | null}
 */
export function normalizeRemovedAnnotTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const entry = /** @type {Record<string, unknown>} */ (value);
  const pageNumber = Number(entry.pageNumber);
  const kind = entry.kind === 'underline' ? 'underline' : entry.kind === 'highlight' ? 'highlight' : null;
  if (!kind || !Number.isFinite(pageNumber) || pageNumber < 1) return null;
  const rect = Array.isArray(entry.pdfRect) ? entry.pdfRect.map(Number) : [];
  if (rect.length < 4 || !rect.slice(0, 4).every((n) => Number.isFinite(n))) return null;
  const x1 = Math.min(rect[0], rect[2]);
  const y1 = Math.min(rect[1], rect[3]);
  const x2 = Math.max(rect[0], rect[2]);
  const y2 = Math.max(rect[1], rect[3]);
  return {
    pageNumber: Math.round(pageNumber),
    kind,
    pdfRect: [x1, y1, x2, y2],
    text: typeof entry.text === 'string' ? entry.text : undefined,
  };
}

/**
 * @param {unknown} payload
 * @returns {PdfViewerSidecarPayload | null}
 */
export function parsePdfViewerSidecarPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (record.format !== PDF_VIEWER_SIDECAR_FORMAT) return null;

  /** @type {PdfViewerViewState} */
  const view = {};
  if (record.view && typeof record.view === 'object') {
    const raw = /** @type {Record<string, unknown>} */ (record.view);
    const page = Number(raw.page);
    if (Number.isFinite(page) && page >= 1) view.page = Math.round(page);
    if (
      raw.zoomMode === 'fitWidth' ||
      raw.zoomMode === 'fitHeight' ||
      raw.zoomMode === 'fitPage' ||
      raw.zoomMode === 'custom'
    ) {
      view.zoomMode = raw.zoomMode;
    }
    const customScale = Number(raw.customScale);
    if (Number.isFinite(customScale) && customScale > 0) view.customScale = customScale;
    const rotation = Number(raw.rotation);
    if (Number.isFinite(rotation)) view.rotation = ((Math.round(rotation) % 360) + 360) % 360;
    if (typeof raw.twoPageView === 'boolean') view.twoPageView = raw.twoPageView;
  }

  /** @type {import('./pdfMarkup.js').PdfMarkupEntry[]} */
  const markups = [];
  if (Array.isArray(record.markups)) {
    for (const item of record.markups) {
      const entry = normalizeMarkupEntry(item);
      if (entry) markups.push(entry);
    }
  }

  /** @type {PdfRemovedAnnotTarget[]} */
  const removed = [];
  if (Array.isArray(record.removed)) {
    for (const item of record.removed) {
      const entry = normalizeRemovedAnnotTarget(item);
      if (entry) removed.push(entry);
    }
  }

  return {
    format: PDF_VIEWER_SIDECAR_FORMAT,
    version: PDF_VIEWER_SIDECAR_VERSION,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : undefined,
    view,
    markups,
    removed,
    marksComplete: record.marksComplete === true,
  };
}

/**
 * @param {string} base64
 * @returns {PdfViewerSidecarPayload | null}
 */
export function parsePdfViewerSidecarBase64(base64) {
  if (!base64) return null;
  try {
    const text = new TextDecoder('utf-8').decode(base64ToBytes(base64));
    return parsePdfViewerSidecarPayload(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   view?: PdfViewerViewState,
 *   markups?: import('./pdfMarkup.js').PdfMarkupEntry[],
 *   removed?: PdfRemovedAnnotTarget[],
 *   marksComplete?: boolean,
 * }} state
 */
export function buildPdfViewerSidecarBase64(state) {
  /** @type {import('./pdfMarkup.js').PdfMarkupEntry[]} */
  const markups = [];
  for (const entry of state.markups || []) {
    if (!entry) continue;
    const normalized = normalizeMarkupEntry(entry);
    if (normalized) markups.push(normalized);
  }

  /** @type {PdfRemovedAnnotTarget[]} */
  const removed = [];
  for (const entry of state.removed || []) {
    const normalized = normalizeRemovedAnnotTarget(entry);
    if (normalized) removed.push(normalized);
  }

  /** @type {PdfViewerSidecarPayload} */
  const payload = {
    format: PDF_VIEWER_SIDECAR_FORMAT,
    version: PDF_VIEWER_SIDECAR_VERSION,
    exportedAt: new Date().toISOString(),
    view: {
      page: state.view?.page,
      zoomMode: state.view?.zoomMode,
      customScale: state.view?.customScale,
      rotation: state.view?.rotation,
      twoPageView: state.view?.twoPageView,
    },
    markups,
    removed,
    marksComplete: state.marksComplete === true,
  };

  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * @param {string} relativePath
 */
async function readSidecarFile(relativePath) {
  try {
    const base64 = await window.nas4usb.fs.readFile(relativePath);
    return parsePdfViewerSidecarBase64(base64);
  } catch {
    return null;
  }
}

/**
 * @param {string} pdfRelativePath
 * @param {{ keepCanonical?: boolean }} [options]
 */
async function removeSiblingViewerSidecars(pdfRelativePath, options = {}) {
  if (!window.nas4usb?.fs?.readDir || !window.nas4usb?.fs?.delete) return;
  const normalized = normalizeRelativePath(pdfRelativePath);
  const slash = normalized.lastIndexOf('/');
  const parent = slash < 0 ? '.' : normalized.slice(0, slash);
  let entries = [];
  try {
    entries = await window.nas4usb.fs.readDir(parent);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!isPdfViewerSidecarRelativePath(entry.relativePath)) continue;
    if (getPdfPathForViewerSidecar(entry.relativePath) !== normalized) continue;
    if (options.keepCanonical && isCanonicalPdfViewerSidecarRelativePath(entry.relativePath)) {
      continue;
    }
    await window.nas4usb.fs.delete(entry.relativePath).catch(() => {});
  }
}

/**
 * @param {string} pdfRelativePath
 * @returns {Promise<PdfViewerSidecarPayload | null>}
 */
export async function loadPdfViewerSidecar(pdfRelativePath) {
  if (!pdfRelativePath || !window.nas4usb?.fs?.readFile) return null;
  if (isExternalFolderPath(pdfRelativePath)) {
    const cached = await readSidecarFile(getPdfViewerStateCacheRelativePath(pdfRelativePath));
    if (cached) return cached;
    const legacy = await readSidecarFile(getPdfViewerSidecarPath(pdfRelativePath));
    if (legacy) {
      try {
        await window.nas4usb.fs.writeFile(
          getPdfViewerStateCacheRelativePath(pdfRelativePath),
          buildPdfViewerSidecarBase64(legacy),
        );
      } catch {
        // listing prune will still remove phone-side copies
      }
      await removeSiblingViewerSidecars(pdfRelativePath);
    }
    return legacy;
  }
  return readSidecarFile(getPdfViewerSidecarPath(pdfRelativePath));
}

/**
 * @param {string} pdfRelativePath
 * @param {{
 *   view?: PdfViewerViewState,
 *   markups?: import('./pdfMarkup.js').PdfMarkupEntry[],
 *   removed?: PdfRemovedAnnotTarget[],
 *   marksComplete?: boolean,
 * }} state
 */
export async function writePdfViewerSidecar(pdfRelativePath, state) {
  if (!pdfRelativePath || !window.nas4usb?.fs?.writeFile) return;
  try {
    const exists = await window.nas4usb.fs.exists(pdfRelativePath);
    if (!exists) {
      await window.nas4usb.fs.delete(getPdfViewerSidecarPath(pdfRelativePath)).catch(() => {});
      if (isExternalFolderPath(pdfRelativePath)) {
        await window.nas4usb.fs.delete(getPdfViewerStateCacheRelativePath(pdfRelativePath)).catch(() => {});
      }
      return;
    }
  } catch {
    return;
  }
  const base64 = buildPdfViewerSidecarBase64(state);
  if (isExternalFolderPath(pdfRelativePath)) {
    await window.nas4usb.fs.writeFile(getPdfViewerStateCacheRelativePath(pdfRelativePath), base64);
    await removeSiblingViewerSidecars(pdfRelativePath);
    return;
  }
  await window.nas4usb.fs.writeFile(getPdfViewerSidecarPath(pdfRelativePath), base64);
  await removeSiblingViewerSidecars(pdfRelativePath, { keepCanonical: true });
}
