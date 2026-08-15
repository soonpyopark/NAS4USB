import { SHARED_FOLDER } from './constants.js';

/** PDF viewer state sidecar, e.g. `report.pdf.viewer.json`. */
export const PDF_VIEWER_SIDECAR_SUFFIX = '.viewer.json';

export const PDF_VIEWER_SIDECAR_FORMAT = 'pdf-viewer';
export const PDF_VIEWER_SIDECAR_VERSION = 1;

/**
 * Canonical `file.pdf.viewer.json` plus iOS/Windows conflict copies:
 * `file.pdf.viewer 2.json`, `file.pdf.viewer (1).json`, `file.pdf.viewer(1).json`.
 */
const PDF_VIEWER_SIDECAR_NAME_RE = /\.pdf\.viewer(?:\s+\d+|\s*\(\d+\))?\.json$/i;
const PDF_VIEWER_SIDECAR_VARIANT_RE = /\.pdf\.viewer(?:\s+\d+|\s*\(\d+\))\.json$/i;

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
function sidecarBaseName(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split('/').pop() ?? normalized;
}

/**
 * @param {string} relativePath
 */
export function isPdfViewerSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  return PDF_VIEWER_SIDECAR_NAME_RE.test(sidecarBaseName(normalized));
}

/**
 * @param {string} relativePath
 */
export function isCanonicalPdfViewerSidecarRelativePath(relativePath) {
  return isPdfViewerSidecarRelativePath(relativePath) && !PDF_VIEWER_SIDECAR_VARIANT_RE.test(sidecarBaseName(relativePath));
}

/**
 * @param {string} pdfRelativePath e.g. `folder/report.pdf`
 */
export function getPdfViewerSidecarPath(pdfRelativePath) {
  return `${normalizeRelativePath(pdfRelativePath)}${PDF_VIEWER_SIDECAR_SUFFIX}`;
}

/**
 * @param {string} sidecarRelativePath e.g. `report.pdf.viewer.json`
 * @returns {string | null}
 */
export function getPdfPathForViewerSidecar(sidecarRelativePath) {
  if (!isPdfViewerSidecarRelativePath(sidecarRelativePath)) return null;
  return normalizeRelativePath(sidecarRelativePath).replace(/\.viewer(?:\s+\d+|\s*\(\d+\))?\.json$/i, '');
}

/**
 * Hidden workspace cache for external-folder PDFs (iOS/Readdle cannot overwrite).
 * @param {string} pdfRelativePath
 */
export function getPdfViewerStateCacheRelativePath(pdfRelativePath) {
  const normalized = normalizeRelativePath(pdfRelativePath).toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const key = (hash >>> 0).toString(16).padStart(8, '0');
  return `${SHARED_FOLDER}/.nas4usb/pdf-viewer/${key}.json`;
}

/**
 * @param {string} relativePath
 */
export function isPdfDocumentRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const base = normalized.split('/').pop() ?? normalized;
  return /\.pdf$/i.test(base) && !isPdfViewerSidecarRelativePath(normalized);
}

/**
 * @param {Array<{ relativePath: string }>} entries
 */
export function filterPdfViewerSidecarFromEntries(entries) {
  return entries.filter((entry) => !isPdfViewerSidecarRelativePath(entry.relativePath));
}
