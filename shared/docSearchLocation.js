/**
 * Parse document-index location_json (Doc Search Engine compatible).
 * @param {unknown} value
 * @returns {{
 *   page?: number,
 *   sheet?: string,
 *   cell?: string,
 *   row?: number,
 *   col?: number,
 *   paragraph?: number,
 *   line?: number,
 *   slide?: number,
 *   note?: boolean,
 *   section?: number,
 *   type?: string,
 * } | null}
 */
export function parseDocSearchLocation(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizeLocation(value);
  }
  try {
    return normalizeLocation(JSON.parse(String(value)));
  } catch {
    return null;
  }
}

/**
 * @param {object} raw
 */
function normalizeLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const page = Number(raw.page);
  const row = Number(raw.row);
  const col = Number(raw.col);
  const paragraph = Number(raw.paragraph);
  const line = Number(raw.line);
  const slide = Number(raw.slide);
  const section = Number(raw.section);
  const location = {
    page: Number.isFinite(page) && page > 0 ? page : undefined,
    sheet: raw.sheet != null ? String(raw.sheet) : undefined,
    cell: raw.cell != null ? String(raw.cell) : undefined,
    row: Number.isFinite(row) && row > 0 ? row : undefined,
    col: Number.isFinite(col) && col > 0 ? col : undefined,
    paragraph: Number.isFinite(paragraph) && paragraph > 0 ? paragraph : undefined,
    line: Number.isFinite(line) && line > 0 ? line : undefined,
    slide: Number.isFinite(slide) && slide > 0 ? slide : undefined,
    note: raw.note === true,
    section: Number.isFinite(section) && section > 0 ? section : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
  };
  return Object.values(location).some((item) => item != null && item !== false && item !== '')
    ? location
    : null;
}

/**
 * Attach explorer-open payload used by editors (query + location).
 * @param {object} entry
 * @param {{ query?: string, locationJson?: unknown, location?: string }} [target]
 */
export function withSearchOpenTarget(entry, target = {}) {
  if (!entry) return entry;
  const highlightQuery = String(target.query ?? '').trim();
  const openLocation = parseDocSearchLocation(target.locationJson);
  const searchLocation = String(target.location ?? '').trim();
  const next = { ...entry };
  if (highlightQuery) next.highlightQuery = highlightQuery;
  else delete next.highlightQuery;
  if (openLocation) next.openLocation = openLocation;
  else delete next.openLocation;
  if (searchLocation) next.searchLocation = searchLocation;
  return next;
}
