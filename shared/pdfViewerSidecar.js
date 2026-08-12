/** PDF viewer state sidecar, e.g. `report.pdf.viewer.json`. */
export const PDF_VIEWER_SIDECAR_SUFFIX = '.viewer.json';

export const PDF_VIEWER_SIDECAR_FORMAT = 'pdf-viewer';
export const PDF_VIEWER_SIDECAR_VERSION = 1;

/**
 * @param {string} relativePath
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '').replace(/\\/g, '/');
}

/**
 * @param {string} relativePath
 */
export function isPdfViewerSidecarRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized === '.') return false;
  const base = normalized.split('/').pop() ?? normalized;
  return base.endsWith(PDF_VIEWER_SIDECAR_SUFFIX) && /\.pdf\.viewer\.json$/i.test(base);
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
  return normalizeRelativePath(sidecarRelativePath).slice(0, -PDF_VIEWER_SIDECAR_SUFFIX.length);
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
