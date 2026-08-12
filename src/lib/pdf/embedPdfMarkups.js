import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from 'pdf-lib';

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} PdfUserRect
 */

/**
 * @param {string} color
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function cssColorToRgb01(color) {
  const value = String(color || '').trim();
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    if (h.length < 6) return null;
    return {
      r: Number.parseInt(h.slice(0, 2), 16) / 255,
      g: Number.parseInt(h.slice(2, 4), 16) / 255,
      b: Number.parseInt(h.slice(4, 6), 16) / 255,
    };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return {
      r: Math.min(255, Number(rgb[1])) / 255,
      g: Math.min(255, Number(rgb[2])) / 255,
      b: Math.min(255, Number(rgb[3])) / 255,
    };
  }
  return null;
}

/**
 * @param {import('pdf-lib').PDFDocument['context']} context
 * @param {string | undefined} cssColor
 * @param {'highlight' | 'underline'} kind
 */
function makePdfColor(context, cssColor, kind) {
  const fallback =
    kind === 'underline' ? { r: 0.9, g: 0.22, b: 0.21 } : { r: 1, g: 0.96, b: 0.62 };
  const rgb = cssColorToRgb01(cssColor || '') || fallback;
  const arr = PDFArray.withContext(context);
  arr.push(PDFNumber.of(rgb.r));
  arr.push(PDFNumber.of(rgb.g));
  arr.push(PDFNumber.of(rgb.b));
  return arr;
}

/**
 * @param {import('pdf-lib').PDFDocument['context']} context
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function makePdfRect(context, x, y, width, height) {
  const arr = PDFArray.withContext(context);
  arr.push(PDFNumber.of(x));
  arr.push(PDFNumber.of(y));
  arr.push(PDFNumber.of(x + width));
  arr.push(PDFNumber.of(y + height));
  return arr;
}

/**
 * QuadPoints: top-left, top-right, bottom-left, bottom-right (PDF user space).
 * @param {import('pdf-lib').PDFDocument['context']} context
 * @param {PdfUserRect[]} rects
 */
function makeQuadPoints(context, rects) {
  const arr = PDFArray.withContext(context);
  for (const rect of rects) {
    const x1 = rect.x;
    const y1 = rect.y;
    const x2 = rect.x + rect.width;
    const y2 = rect.y + rect.height;
    arr.push(PDFNumber.of(x1));
    arr.push(PDFNumber.of(y2));
    arr.push(PDFNumber.of(x2));
    arr.push(PDFNumber.of(y2));
    arr.push(PDFNumber.of(x1));
    arr.push(PDFNumber.of(y1));
    arr.push(PDFNumber.of(x2));
    arr.push(PDFNumber.of(y1));
  }
  return arr;
}

/**
 * @param {PdfUserRect[]} rects
 */
function boundingBox(rects) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Convert pdf.js scale-1 viewport rects (top-left) → PDF user-space rects.
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {number} [rotation]
 * @returns {Promise<PdfUserRect[]>}
 */
export async function viewportRectsToPdfUserRects(page, rects, rotation = 0) {
  const viewport = page.getViewport({ scale: 1, rotation });
  /** @type {PdfUserRect[]} */
  const out = [];
  for (const rect of rects) {
    if (!rect || rect.width < 0.5 || rect.height < 0.5) continue;
    const [x1, y1] = viewport.convertToPdfPoint(rect.left, rect.top + rect.height);
    const [x2, y2] = viewport.convertToPdfPoint(rect.left + rect.width, rect.top);
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (width < 0.5 || height < 0.5) continue;
    out.push({ x, y, width, height });
  }
  return out;
}

/**
 * @typedef {{
 *   pageNumber: number,
 *   kind: 'highlight' | 'underline',
 *   pdfRect: [number, number, number, number],
 *   text?: string,
 * }} PdfRemovedAnnot
 */

/**
 * @param {[number, number, number, number] | undefined} a
 * @param {[number, number, number, number] | undefined} b
 * @param {number} [tol]
 */
export function pdfRectsClose(a, b, tol = 1.5) {
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol &&
    Math.abs(a[3] - b[3]) <= tol
  );
}

/**
 * @param {{ pageNumber?: number, kind?: string, pdfRect?: [number, number, number, number] }} entry
 * @param {PdfRemovedAnnot} target
 */
export function isSamePdfAnnotTarget(entry, target) {
  if (!entry || !target) return false;
  if (Number(entry.pageNumber) !== Number(target.pageNumber)) return false;
  if (entry.kind !== target.kind) return false;
  return pdfRectsClose(entry.pdfRect, target.pdfRect);
}

/**
 * @param {number[]} rect
 * @returns {[number, number, number, number]}
 */
function normalizePdfRectTuple(rect) {
  const x1 = Number(rect[0]);
  const y1 = Number(rect[1]);
  const x2 = Number(rect[2]);
  const y2 = Number(rect[3]);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {PdfRemovedAnnot[]} targets
 */
function removeMatchingAnnotsFromPage(page, targets) {
  if (!targets.length) return;
  const annots = page.node.Annots();
  if (!annots || annots.size() === 0) return;

  /** @type {import('pdf-lib').PDFRef[]} */
  const refsToRemove = [];
  for (let index = 0; index < annots.size(); index += 1) {
    const annot = annots.lookupMaybe(index, PDFDict);
    if (!annot) continue;
    const subtype = annot.get(PDFName.of('Subtype'));
    const kind =
      subtype === PDFName.of('Underline')
        ? 'underline'
        : subtype === PDFName.of('Highlight')
          ? 'highlight'
          : null;
    if (!kind) continue;

    const rectObj = annot.lookupMaybe(PDFName.of('Rect'), PDFArray);
    if (!rectObj || rectObj.size() < 4) continue;
    try {
      const pdfRect = normalizePdfRectTuple([
        rectObj.lookup(0, PDFNumber).asNumber(),
        rectObj.lookup(1, PDFNumber).asNumber(),
        rectObj.lookup(2, PDFNumber).asNumber(),
        rectObj.lookup(3, PDFNumber).asNumber(),
      ]);
      const hit = targets.some((target) => target.kind === kind && pdfRectsClose(pdfRect, target.pdfRect));
      if (hit) {
        const ref = annots.get(index);
        if (ref) refsToRemove.push(/** @type {import('pdf-lib').PDFRef} */ (ref));
      }
    } catch {
      // skip malformed annot
    }
  }

  for (const ref of refsToRemove) {
    page.node.removeAnnot(ref);
  }
}

/**
 * Embed viewer markups (highlight / underline) into PDF bytes, optionally removing existing annots.
 *
 * @param {Uint8Array} pdfBytes
 * @param {Array<{
 *   pageNumber: number,
 *   kind: 'highlight' | 'underline',
 *   color: string,
 *   text?: string,
 *   pdfRects: PdfUserRect[],
 * }>} markups
 * @param {PdfRemovedAnnot[]} [remove]
 * @returns {Promise<Uint8Array>}
 */
export async function embedMarkupsIntoPdfBytes(pdfBytes, markups, remove = []) {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes), { updateMetadata: false });
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();

  /** @type {Map<number, PdfRemovedAnnot[]>} */
  const removeByPage = new Map();
  for (const target of remove) {
    if (!target?.pdfRect || target.pageNumber < 1) continue;
    const pageIndex = target.pageNumber - 1;
    const list = removeByPage.get(pageIndex) || [];
    list.push(target);
    removeByPage.set(pageIndex, list);
  }
  for (const [pageIndex, targets] of removeByPage.entries()) {
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    removeMatchingAnnotsFromPage(pages[pageIndex], targets);
  }

  for (const entry of markups) {
    if (!entry?.pdfRects?.length) continue;
    const pageIndex = entry.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const kind = entry.kind === 'underline' ? 'underline' : 'highlight';

    const dict = PDFDict.withContext(context);
    dict.set(PDFName.of('Type'), PDFName.of('Annot'));
    dict.set(PDFName.of('Subtype'), PDFName.of(kind === 'underline' ? 'Underline' : 'Highlight'));
    dict.set(PDFName.of('F'), PDFNumber.of(4)); // Print

    const bb = boundingBox(entry.pdfRects);
    dict.set(PDFName.of('Rect'), makePdfRect(context, bb.x, bb.y, bb.width, bb.height));
    dict.set(PDFName.of('QuadPoints'), makeQuadPoints(context, entry.pdfRects));
    dict.set(PDFName.of('C'), makePdfColor(context, entry.color, kind));

    const contents = String(entry.text || '').trim();
    if (contents) {
      dict.set(PDFName.of('Contents'), PDFHexString.fromText(contents));
    }

    const annotRef = context.register(dict);
    page.node.addAnnot(annotRef);
  }

  const saved = await pdfDoc.save({ useObjectStreams: false });
  return saved instanceof Uint8Array ? new Uint8Array(saved) : Uint8Array.from(saved);
}
