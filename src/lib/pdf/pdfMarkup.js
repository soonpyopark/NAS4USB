import { AnnotationType, TextLayer, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getPageTextContent } from './pdfjs.js';

/**
 * @typedef {{
 *   x0: number,
 *   y0: number,
 *   x1: number,
 *   y1: number,
 *   text: string,
 *   blockNo: number,
 *   lineNo: number,
 *   wordNo: number,
 *   gapBefore?: boolean,
 * }} PdfWord
 *
 * @typedef {{
 *   id: string,
 *   pageNumber: number,
 *   kind: 'highlight' | 'underline',
 *   color: string,
 *   text: string,
 *   rects: Array<{ left: number, top: number, width: number, height: number }>,
 *   source: 'pdf' | 'session' | 'saved',
 *   pdfRect?: [number, number, number, number],
 * }} PdfMarkupEntry
 *
 * @typedef {{
 *   text: string,
 *   words: PdfWord[],
 *   rects: Array<{ left: number, top: number, width: number, height: number }>,
 * }} PdfTextSelection
 */

/** Tiny PDF Editor highlight presets (order matches Tiny). */
const HIGHLIGHT_PRESETS = {
  gray: '#e0e0e0',
  yellow: '#fff59d',
  red: '#ffcdd2',
  blue: '#bbdefb',
  green: '#c8e6c9',
};

const UNDERLINE_PRESETS = {
  gray: '#616161',
  yellow: '#f9a825',
  red: '#e53935',
  blue: '#1e88e5',
  green: '#43a047',
};

export const PDF_HIGHLIGHT_PRESET_ORDER = /** @type {const} */ ([
  'gray',
  'yellow',
  'red',
  'blue',
  'green',
]);

export const PDF_UNDERLINE_PRESET_ORDER = PDF_HIGHLIGHT_PRESET_ORDER;

export const PDF_HIGHLIGHT_PRESET_LABELS = {
  gray: '연한 회색',
  yellow: '연한 노랑',
  red: '연한 빨강',
  blue: '연한 파랑',
  green: '연한 초록',
};

export const PDF_UNDERLINE_PRESET_LABELS = {
  gray: '회색',
  yellow: '노랑',
  red: '빨강',
  blue: '파랑',
  green: '초록',
};

/** Tiny live-selection blue ≈ QColor(51, 153, 255, 90). */
export const PDF_LIVE_SELECTION_FILL = 'rgba(51, 153, 255, 0.35)';

/** Viewer highlight wash — keep text readable under the tint. */
export const PDF_HIGHLIGHT_OVERLAY_OPACITY = 0.28;

export function pdfHighlightPresetColor(id = 'yellow') {
  return HIGHLIGHT_PRESETS[id] || HIGHLIGHT_PRESETS.yellow;
}

export function pdfUnderlinePresetColor(id = 'red') {
  return UNDERLINE_PRESETS[id] || UNDERLINE_PRESETS.red;
}

/**
 * @param {number[]} color
 * @returns {string}
 */
function rgbArrayToCss(color) {
  if (!Array.isArray(color) || color.length < 3) return pdfHighlightPresetColor('yellow');
  const [r, g, b] = color;
  const toByte = (v) =>
    Math.max(0, Math.min(255, Math.round(Number(v) <= 1 ? Number(v) * 255 : Number(v))));
  return `rgb(${toByte(r)}, ${toByte(g)}, ${toByte(b)})`;
}

/**
 * @param {PdfWord} word
 * @returns {[number, number]}
 */
function wordLineId(word) {
  return [word.blockNo, word.lineNo];
}

/**
 * @param {PdfWord} word
 * @returns {[number, number, number]}
 */
function wordSortKey(word) {
  return [word.blockNo, word.lineNo, word.wordNo];
}

/**
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
function lineIdLess(a, b) {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/**
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
function lineIdEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 */
function sortKeyCmp(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 */
function sortKeyLte(a, b) {
  return sortKeyCmp(a, b) <= 0;
}

/**
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 */
function sortKeyGte(a, b) {
  return sortKeyCmp(a, b) >= 0;
}

/** @type {Intl.Segmenter | null | undefined} */
let graphemeSegmenter;

/**
 * Split into user-perceived characters (Hangul jamo clusters, emoji, etc.).
 * @param {string} text
 * @returns {string[]}
 */
export function segmentGraphemes(text) {
  const raw = String(text || '');
  if (!raw) return [];
  try {
    if (graphemeSegmenter === undefined) {
      graphemeSegmenter =
        typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
          ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          : null;
    }
    if (graphemeSegmenter) {
      return [...graphemeSegmenter.segment(raw)].map((part) => part.segment);
    }
  } catch {
    graphemeSegmenter = null;
  }
  return [...raw];
}

/**
 * Relative widths for graphemes in a run (scaled to `runWidth` by the caller).
 * Uses canvas measureText when available so proportional Hangul is closer than
 * raw code-unit counts.
 *
 * @param {string[]} graphemes
 * @param {number} fontHeight
 * @returns {number[]}
 */
function graphemeWidthWeights(graphemes, fontHeight) {
  const n = graphemes.length;
  if (n <= 0) return [];
  if (n === 1) return [1];
  const height = Math.max(8, fontHeight || 12);
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${height}px sans-serif`;
        const weights = graphemes.map((g) => Math.max(0.05, ctx.measureText(g).width || g.length));
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum > 0) return weights;
      }
    }
  } catch {
    // fall through
  }
  return graphemes.map((g) => Math.max(1, g.length));
}

/**
 * Emit grapheme boxes for one non-space text run.
 *
 * @param {string} raw
 * @param {number} x0Run
 * @param {number} y0
 * @param {number} y1
 * @param {number} runWidth
 * @param {boolean} gapBeforeFirst
 * @returns {Array<Omit<PdfWord, 'blockNo' | 'lineNo' | 'wordNo'>>}
 */
function graphemeBoxesForRun(raw, x0Run, y0, y1, runWidth, gapBeforeFirst) {
  const graphemes = segmentGraphemes(raw);
  if (!graphemes.length) return [];
  const fontHeight = Math.max(1, y1 - y0);
  const weights = graphemeWidthWeights(graphemes, fontHeight);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const totalW = Math.max(graphemes.length * 0.5, runWidth);
  /** @type {Array<Omit<PdfWord, 'blockNo' | 'lineNo' | 'wordNo'>>} */
  const boxes = [];
  let x = x0Run;
  for (let i = 0; i < graphemes.length; i += 1) {
    const w = (weights[i] / weightSum) * totalW;
    const width = Math.max(0.5, w);
    boxes.push({
      x0: x,
      y0,
      x1: x + width,
      y1,
      text: graphemes[i],
      gapBefore: i === 0 ? Boolean(gapBeforeFirst) : false,
    });
    x += width;
  }
  return boxes;
}

/**
 * @param {PdfWord[]} words
 * @returns {PdfWord[]}
 */
function reassignLineNumbers(words) {
  if (!words.length) return words;
  const sorted = [...words].sort(
    (a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0 || a.x1 - b.x1,
  );

  /** @type {PdfWord[][]} */
  const lines = [];
  /** @type {PdfWord[]} */
  let lineWords = [];
  let lineCenterY = (sorted[0].y0 + sorted[0].y1) / 2;
  let lineHeight = Math.max(1, sorted[0].y1 - sorted[0].y0);

  for (const word of sorted) {
    const cy = (word.y0 + word.y1) / 2;
    const h = Math.max(1, word.y1 - word.y0);
    const threshold = Math.max(4, Math.min(lineHeight, h) * 0.7);
    if (lineWords.length && Math.abs(cy - lineCenterY) > threshold) {
      lines.push(lineWords);
      lineWords = [word];
      lineCenterY = cy;
      lineHeight = h;
    } else {
      lineWords.push(word);
      if (lineWords.length === 1) {
        lineCenterY = cy;
        lineHeight = h;
      } else {
        lineCenterY = lineCenterY * 0.65 + cy * 0.35;
        lineHeight = Math.max(lineHeight, h);
      }
    }
  }
  if (lineWords.length) lines.push(lineWords);

  /** @type {PdfWord[]} */
  const result = [];
  lines.forEach((group, lineNo) => {
    // Tiny midY differences inside a line must not reorder by Y — sort by X for reading order.
    group.sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
    group.forEach((word, wordNo) => {
      result.push({
        ...word,
        blockNo: 0,
        lineNo,
        wordNo,
      });
    });
  });
  return result;
}

/**
 * Extract grapheme boxes from a pdf.js page (scale-1 viewport coords).
 * Whitespace-separated runs become `gapBefore` boundaries; each run is split
 * into graphemes so drag selection can start/end on a character like a browser.
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} [rotation]
 * @returns {Promise<PdfWord[]>}
 */
export async function extractPageWords(page, rotation = 0) {
  const viewport = page.getViewport({ scale: 1, rotation });
  const textContent = await getPageTextContent(page);
  /** @type {Array<Omit<PdfWord, 'blockNo' | 'lineNo' | 'wordNo'>>} */
  const rawWords = [];

  // item.width is already in PDF user space (same units as item.transform translation).
  // Scale only by the viewport — never by the font matrix inside item.transform (that double-counts).
  const viewportXScale = Math.hypot(viewport.transform[0], viewport.transform[1]) || 1;

  for (const item of textContent.items) {
    if (!item || typeof item.str !== 'string') continue;

    const tx = Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 10;
    const baseline = tx[5];

    const raw = item.str;
    if (!raw) continue;

    const runWidth = Math.max(0.5, (Number(item.width) || 0) * viewportXScale);
    const x0Run = tx[4];
    const y1 = baseline;
    const y0 = y1 - fontHeight;

    let offset = 0;
    let gapBeforeNext = false;
    const pieces = raw.split(/(\s+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      const isSpace = /^\s+$/.test(piece);
      const pieceWidth = (piece.length / Math.max(1, raw.length)) * runWidth;
      const x0 = x0Run + (offset / Math.max(1, raw.length)) * runWidth;
      offset += piece.length;
      if (isSpace) {
        gapBeforeNext = true;
        continue;
      }

      const boxes = graphemeBoxesForRun(piece, x0, y0, y1, Math.max(1, pieceWidth), gapBeforeNext);
      gapBeforeNext = false;
      for (const box of boxes) rawWords.push(box);
    }
  }

  /** @type {PdfWord[]} */
  const withIds = rawWords.map((word, wordNo) => ({
    ...word,
    blockNo: 0,
    lineNo: 0,
    wordNo,
  }));
  return reassignLineNumbers(withIds);
}

/**
 * Prefer the text line under the pointer, then pick the nearest grapheme by
 * edge distance (not box center) so starts/ends land on the intended character.
 *
 * @param {PdfWord[]} words
 * @param {{ x: number, y: number }} point
 */
export function wordIndexAtPoint(words, point) {
  if (!words.length) return -1;

  // Prefer the tightest containing box (avoids oversized glyph runs stealing hits).
  let inside = -1;
  let insideArea = Infinity;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (point.x >= word.x0 && point.x <= word.x1 && point.y >= word.y0 && point.y <= word.y1) {
      const area = Math.max(1, word.x1 - word.x0) * Math.max(1, word.y1 - word.y0);
      if (area < insideArea) {
        insideArea = area;
        inside = index;
      }
    }
  }
  if (inside >= 0) return inside;

  /** @type {Map<string, number[]>} */
  const byLine = new Map();
  for (let index = 0; index < words.length; index += 1) {
    const key = `${words[index].blockNo}:${words[index].lineNo}`;
    let list = byLine.get(key);
    if (!list) {
      list = [];
      byLine.set(key, list);
    }
    list.push(index);
  }

  let bestLineKey = '';
  let bestLineScore = Infinity;
  for (const [key, indices] of byLine.entries()) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const index of indices) {
      y0 = Math.min(y0, words[index].y0);
      y1 = Math.max(y1, words[index].y1);
    }
    const midY = (y0 + y1) / 2;
    const vertical =
      point.y >= y0 && point.y <= y1
        ? 0
        : Math.min(Math.abs(point.y - y0), Math.abs(point.y - y1));
    const score = vertical * 1000 + Math.abs(point.y - midY);
    if (score < bestLineScore) {
      bestLineScore = score;
      bestLineKey = key;
    }
  }

  const lineIndices = (byLine.get(bestLineKey) || []).slice().sort((a, b) => {
    if (words[a].x0 !== words[b].x0) return words[a].x0 - words[b].x0;
    return a - b;
  });
  if (!lineIndices.length) return 0;

  const first = lineIndices[0];
  const last = lineIndices[lineIndices.length - 1];
  const firstWord = words[first];
  const lastWord = words[last];
  // Small pads only — large pads used to yank the caret to the first/last token.
  const endPad = Math.max(1.5, (lastWord.x1 - lastWord.x0) * 0.2);
  const startPad = Math.max(1.5, (firstWord.x1 - firstWord.x0) * 0.2);

  if (point.x <= firstWord.x0 + startPad) return first;
  if (point.x >= lastWord.x1 - endPad) return last;

  let best = first;
  let bestDist = Infinity;
  for (const index of lineIndices) {
    const word = words[index];
    if (point.x >= word.x0 && point.x <= word.x1) {
      // Inside X band: nearer edge decides (left half → this glyph, right → stays this glyph).
      return index;
    }
    const dist =
      point.x < word.x0 ? word.x0 - point.x : point.x - word.x1;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

/**
 * Expand a grapheme index to the surrounding whitespace-delimited token
 * (for tap / long-press “word” select on touch).
 *
 * @param {PdfWord[]} words
 * @param {number} index
 * @returns {[number, number]}
 */
export function tokenRangeContaining(words, index) {
  if (!words.length || index < 0 || index >= words.length) return [index, index];
  const line = wordLineId(words[index]);
  let from = index;
  let to = index;
  while (from > 0) {
    const prev = words[from - 1];
    if (!lineIdEqual(wordLineId(prev), line)) break;
    if (words[from].gapBefore) break;
    from -= 1;
  }
  while (to + 1 < words.length) {
    const next = words[to + 1];
    if (!lineIdEqual(wordLineId(next), line)) break;
    if (next.gapBefore) break;
    to += 1;
  }
  return [from, to];
}

/**
 * @param {PdfWord[]} words
 * @returns {Array<{ left: number, top: number, width: number, height: number }>}
 */
export function markupRectsFromWords(words) {
  if (!words.length) return [];
  const ordered = [...words].sort((a, b) => sortKeyCmp(wordSortKey(a), wordSortKey(b)));
  /** @type {Array<{ left: number, top: number, width: number, height: number }>} */
  const rects = [];
  /** @type {PdfWord[]} */
  let lineWords = [ordered[0]];
  let currentLine = wordLineId(ordered[0]);

  const flush = (group) => {
    if (!group.length) return;
    const left = Math.min(...group.map((w) => w.x0));
    const top = Math.min(...group.map((w) => w.y0));
    const right = Math.max(...group.map((w) => w.x1));
    const bottom = Math.max(...group.map((w) => w.y1));
    rects.push({
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    });
  };

  for (let i = 1; i < ordered.length; i += 1) {
    const word = ordered[i];
    const line = wordLineId(word);
    if (!lineIdEqual(line, currentLine)) {
      flush(lineWords);
      lineWords = [word];
      currentLine = line;
    } else {
      lineWords.push(word);
    }
  }
  flush(lineWords);
  return rects;
}

/**
 * @param {PdfWord[]} words
 */
export function selectionTextFromWords(words) {
  if (!words.length) return '';
  const ordered = [...words].sort((a, b) => sortKeyCmp(wordSortKey(a), wordSortKey(b)));
  /** @type {string[]} */
  const lines = [];
  let lineText = '';
  /** @type {[number, number] | null} */
  let currentLine = null;

  for (const word of ordered) {
    const line = wordLineId(word);
    if (!currentLine || !lineIdEqual(line, currentLine)) {
      if (lineText) lines.push(lineText);
      lineText = word.text || '';
      currentLine = line;
    } else {
      if (word.gapBefore) lineText += ' ';
      lineText += word.text || '';
    }
  }
  if (lineText) lines.push(lineText);

  /** @type {string[]} */
  const result = [];
  for (const text of lines) {
    if (result.length && result[result.length - 1].trimEnd().endsWith('.')) {
      result.push(' ');
    }
    result.push(text);
  }
  return result.join('');
}

/**
 * Tiny PDF line-wise text selection (drag down/up includes full intermediate lines).
 *
 * @param {PdfWord[]} words
 * @param {{ x: number, y: number }} anchor
 * @param {{ x: number, y: number }} cursor
 * @returns {PdfTextSelection | null}
 */
export function getTextBlockSelection(words, anchor, cursor) {
  if (!words.length) return null;

  const anchorIdx = wordIndexAtPoint(words, anchor);
  const cursorIdx = wordIndexAtPoint(words, cursor);
  if (anchorIdx < 0 || cursorIdx < 0) return null;

  const anchorWord = words[anchorIdx];
  const cursorWord = words[cursorIdx];
  const anchorLine = wordLineId(anchorWord);
  const cursorLine = wordLineId(cursorWord);
  /** @type {PdfWord[]} */
  const selected = [];

  if (lineIdEqual(anchorLine, cursorLine)) {
    const keys = [wordSortKey(anchorWord), wordSortKey(cursorWord)].sort(sortKeyCmp);
    const lo = keys[0];
    const hi = keys[1];
    for (const word of words) {
      if (!lineIdEqual(wordLineId(word), anchorLine)) continue;
      const key = wordSortKey(word);
      if (sortKeyGte(key, lo) && sortKeyLte(key, hi)) selected.push(word);
    }
  } else if (lineIdLess(anchorLine, cursorLine)) {
    const anchorKey = wordSortKey(anchorWord);
    const cursorKey = wordSortKey(cursorWord);
    for (const word of words) {
      const currentLine = wordLineId(word);
      const currentKey = wordSortKey(word);
      if (lineIdEqual(currentLine, anchorLine)) {
        if (sortKeyGte(currentKey, anchorKey)) selected.push(word);
      } else if (lineIdEqual(currentLine, cursorLine)) {
        if (sortKeyLte(currentKey, cursorKey)) selected.push(word);
      } else if (lineIdLess(anchorLine, currentLine) && lineIdLess(currentLine, cursorLine)) {
        selected.push(word);
      }
    }
  } else {
    const anchorKey = wordSortKey(anchorWord);
    const cursorKey = wordSortKey(cursorWord);
    for (const word of words) {
      const currentLine = wordLineId(word);
      const currentKey = wordSortKey(word);
      if (lineIdEqual(currentLine, cursorLine)) {
        if (sortKeyGte(currentKey, cursorKey)) selected.push(word);
      } else if (lineIdEqual(currentLine, anchorLine)) {
        if (sortKeyLte(currentKey, anchorKey)) selected.push(word);
      } else if (lineIdLess(cursorLine, currentLine) && lineIdLess(currentLine, anchorLine)) {
        selected.push(word);
      }
    }
  }

  if (!selected.length) return null;
  selected.sort((a, b) => sortKeyCmp(wordSortKey(a), wordSortKey(b)));
  return {
    text: selectionTextFromWords(selected),
    words: selected,
    rects: markupRectsFromWords(selected),
  };
}

/**
 * @param {PdfWord[]} words
 * @param {number} indexA
 * @param {number} indexB
 * @returns {PdfTextSelection | null}
 */
export function getTextBlockSelectionByIndices(words, indexA, indexB) {
  if (!words.length || indexA < 0 || indexB < 0) return null;
  if (indexA >= words.length || indexB >= words.length) return null;
  const a = words[indexA];
  const b = words[indexB];
  return getTextBlockSelection(
    words,
    { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 },
    { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 },
  );
}

/**
 * Handle anchors for an active selection (scale-1 page coords).
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @returns {{
 *   start: { x: number, y: number, lineTop: number, height: number },
 *   end: { x: number, y: number, lineTop: number, height: number },
 * } | null}
 */
export function selectionHandlePoints(rects) {
  if (!Array.isArray(rects) || !rects.length) return null;
  const first = rects[0];
  const last = rects[rects.length - 1];
  // Visual stem matches the blue selection box height; head sits below the box.
  // `y` stays near the line center for word/range hit tests while dragging.
  return {
    start: {
      x: first.left,
      y: first.top + first.height / 2,
      lineTop: first.top,
      height: Math.max(4, first.height),
    },
    end: {
      x: last.left + last.width,
      y: last.top + last.height / 2,
      lineTop: last.top,
      height: Math.max(4, last.height),
    },
  };
}

/**
 * @param {{ x: number, y: number }} point
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {number} [hitRadius]
 * @returns {'start' | 'end' | null}
 */
export function hitTestSelectionHandle(point, rects, hitRadius = 18) {
  const handles = selectionHandlePoints(rects);
  if (!handles || !point) return null;
  const r2 = hitRadius * hitRadius;
  const dist2 = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  /** Nearest distance to the knob (below the box) or the stem mid. */
  const nearest = (handle) => {
    const head = { x: handle.x, y: handle.lineTop + handle.height + 9 };
    const mid = { x: handle.x, y: handle.lineTop + handle.height / 2 };
    return Math.min(dist2(point, head), dist2(point, mid));
  };
  const startDist = nearest(handles.start);
  const endDist = nearest(handles.end);
  if (startDist <= r2 && startDist <= endDist) return 'start';
  if (endDist <= r2) return 'end';
  return null;
}

/**
 * Capture current DOM selection as CSS-pixel rects relative to a page wrap
 * (current on-screen page size — divide by cssScale to store at scale 1).
 * @param {HTMLElement} pageWrap
 * @returns {{ text: string, rects: Array<{ left: number, top: number, width: number, height: number }> } | null}
 */
export function captureSelectionInPageWrap(pageWrap) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!pageWrap.contains(range.commonAncestorContainer)) return null;

  const text = String(selection.toString() || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const pageRect = pageWrap.getBoundingClientRect();
  const scaleX = pageWrap.clientWidth / Math.max(1, pageRect.width);
  const scaleY = pageWrap.clientHeight / Math.max(1, pageRect.height);

  /** @type {Array<{ left: number, top: number, width: number, height: number }>} */
  const rawRects = [];
  for (const clientRect of range.getClientRects()) {
    if (clientRect.width < 1 || clientRect.height < 1) continue;
    rawRects.push({
      left: (clientRect.left - pageRect.left) * scaleX,
      top: (clientRect.top - pageRect.top) * scaleY,
      width: clientRect.width * scaleX,
      height: clientRect.height * scaleY,
    });
  }
  if (!rawRects.length) return null;

  // Merge glyph boxes into continuous per-line bands (Tiny-style).
  const sorted = [...rawRects].sort((a, b) => a.top - b.top || a.left - b.left);
  /** @type {Array<{ left: number, top: number, width: number, height: number }>} */
  const merged = [];
  for (const rect of sorted) {
    const line = merged.find((entry) => Math.abs(entry.top - rect.top) <= Math.max(3, rect.height * 0.45));
    if (!line) {
      merged.push({ ...rect });
      continue;
    }
    const right = Math.max(line.left + line.width, rect.left + rect.width);
    const bottom = Math.max(line.top + line.height, rect.top + rect.height);
    line.left = Math.min(line.left, rect.left);
    line.top = Math.min(line.top, rect.top);
    line.width = right - line.left;
    line.height = bottom - line.top;
  }

  return { text, rects: merged };
}

/**
 * Build word list from a rendered pdf.js text layer (DOM spans).
 * Coordinates are scale-1 page units (mapped via the wrap's on-screen box).
 *
 * @param {HTMLElement} textLayerEl
 * @param {HTMLElement} pageWrap
 * @param {number} [cssScale] fallback only
 * @returns {PdfWord[]}
 */
export function extractWordsFromTextLayer(textLayerEl, pageWrap, cssScale = 1) {
  const pageRect = pageWrap.getBoundingClientRect();
  if (pageRect.width < 1 || pageRect.height < 1) return [];

  const base = getPageWrapBaseSize(pageWrap);
  const baseW = base?.width || pageWrap.clientWidth / Math.max(0.01, cssScale || 1);
  const baseH = base?.height || pageWrap.clientHeight / Math.max(0.01, cssScale || 1);

  const spans = [...textLayerEl.querySelectorAll('span')].filter(
    (node) => node.textContent && String(node.textContent).trim(),
  );
  if (!spans.length) return [];

  const toPage = (clientRect) => {
    const left = ((clientRect.left - pageRect.left) / pageRect.width) * baseW;
    const top = ((clientRect.top - pageRect.top) / pageRect.height) * baseH;
    const width = (clientRect.width / pageRect.width) * baseW;
    const height = (clientRect.height / pageRect.height) * baseH;
    return {
      x0: left,
      y0: top,
      x1: left + Math.max(0.5, width),
      y1: top + Math.max(0.5, height),
    };
  };

  /** @type {Array<Omit<PdfWord, 'blockNo' | 'lineNo' | 'wordNo'>>} */
  const rawWords = [];

  for (const span of spans) {
    const textNode = [...span.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || '').length,
    );
    const full = String(textNode?.textContent ?? span.textContent ?? '');
    if (!full.trim()) continue;

    const spanBox = toPage(span.getBoundingClientRect());
    if (spanBox.x1 - spanBox.x0 < 0.5 || spanBox.y1 - spanBox.y0 < 0.5) continue;

    let gapBeforeNext = /^\s/.test(full);
    let offset = 0;
    const pieces = full.split(/(\s+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        gapBeforeNext = true;
        offset += piece.length;
        continue;
      }

      const graphemes = segmentGraphemes(piece);
      if (!graphemes.length) {
        offset += piece.length;
        continue;
      }

      /** @type {Array<{ x0: number, y0: number, x1: number, y1: number } | null>} */
      const glyphBoxes = [];
      if (textNode && typeof document !== 'undefined') {
        const range = document.createRange();
        for (let i = 0; i < graphemes.length; i += 1) {
          const start = offset;
          const end = offset + graphemes[i].length;
          try {
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
            const rects = [...range.getClientRects()].filter((r) => r.width >= 0.5 && r.height >= 0.5);
            glyphBoxes.push(rects.length ? toPage(rects[0]) : null);
          } catch {
            glyphBoxes.push(null);
          }
          offset = end;
        }
      } else {
        offset += piece.length;
        for (let i = 0; i < graphemes.length; i += 1) glyphBoxes.push(null);
      }

      const missing = glyphBoxes.some((box) => !box);
      if (missing) {
        const pieceWidth = spanBox.x1 - spanBox.x0;
        const approx = graphemeBoxesForRun(
          piece,
          spanBox.x0,
          spanBox.y0,
          spanBox.y1,
          Math.max(1, pieceWidth * (piece.length / Math.max(1, full.trim().length))),
          gapBeforeNext,
        );
        for (const box of approx) rawWords.push(box);
      } else {
        for (let i = 0; i < graphemes.length; i += 1) {
          const box = glyphBoxes[i];
          if (!box) continue;
          rawWords.push({
            ...box,
            text: graphemes[i],
            gapBefore: i === 0 ? gapBeforeNext : false,
          });
        }
      }
      gapBeforeNext = false;
    }
  }

  /** @type {PdfWord[]} */
  const withIds = rawWords.map((word, wordNo) => ({
    ...word,
    blockNo: 0,
    lineNo: 0,
    wordNo,
  }));
  return reassignLineNumbers(withIds);
}

/**
 * Scale-1 page size stored on the page wrap (set while painting).
 * @param {HTMLElement} pageWrap
 * @returns {{ width: number, height: number } | null}
 */
export function getPageWrapBaseSize(pageWrap) {
  const width = Number(pageWrap?.dataset?.pdfBaseWidth || 0);
  const height = Number(pageWrap?.dataset?.pdfBaseHeight || 0);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

/**
 * Actual CSS scale of a painted page wrap (handles fit-width shrink / max-width).
 * @param {HTMLElement} pageWrap
 * @param {number} [fallback]
 */
export function getPageDisplayScale(pageWrap, fallback = 1) {
  const base = getPageWrapBaseSize(pageWrap);
  if (base && pageWrap.clientWidth > 0) {
    return pageWrap.clientWidth / base.width;
  }
  return Math.max(0.01, fallback || 1);
}

/**
 * Map client point → scale-1 page coordinates inside a page wrap.
 * Uses the wrap's on-screen box vs base page size so fit-width / max-width stay accurate.
 *
 * @param {HTMLElement} pageWrap
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [cssScale] fallback when base size is missing
 */
export function clientPointToPagePoint(pageWrap, clientX, clientY, cssScale = 1) {
  const rect = pageWrap.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return { x: 0, y: 0 };

  const base = getPageWrapBaseSize(pageWrap);
  if (base) {
    return {
      x: ((clientX - rect.left) / rect.width) * base.width,
      y: ((clientY - rect.top) / rect.height) * base.height,
    };
  }

  const scaleX = pageWrap.clientWidth / Math.max(1, rect.width);
  const scaleY = pageWrap.clientHeight / Math.max(1, rect.height);
  const scale = Math.max(0.01, cssScale || 1);
  return {
    x: ((clientX - rect.left) * scaleX) / scale,
    y: ((clientY - rect.top) * scaleY) / scale,
  };
}

/**
 * @param {number[] | undefined} quadPoints
 * @param {import('pdfjs-dist').PageViewport} viewport
 * @returns {Array<{ left: number, top: number, width: number, height: number }>}
 */
function viewportRectsFromQuadPoints(quadPoints, viewport) {
  /** @type {Array<{ left: number, top: number, width: number, height: number }>} */
  const rects = [];
  // pdf.js returns Float32Array — Array.isArray is false, so treat as array-like.
  const points =
    quadPoints && typeof quadPoints.length === 'number' ? Array.from(quadPoints) : null;
  if (!points || points.length < 8) return rects;

  for (let index = 0; index + 7 < points.length; index += 8) {
    /** @type {number[]} */
    const xs = [];
    /** @type {number[]} */
    const ys = [];
    for (let point = 0; point < 4; point += 1) {
      const [vx, vy] = viewport.convertToViewportPoint(
        Number(points[index + point * 2]) || 0,
        Number(points[index + point * 2 + 1]) || 0,
      );
      xs.push(vx);
      ys.push(vy);
    }
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left;
    const height = bottom - top;
    if (width < 0.5 || height < 0.5) continue;
    rects.push({ left, top, width, height });
  }
  return rects;
}

/**
 * @param {PdfWord} word
 * @param {{ left: number, top: number, width: number, height: number }} rect
 */
function wordCenterInCssRect(word, rect) {
  const cx = (word.x0 + word.x1) / 2;
  const cy = (word.y0 + word.y1) / 2;
  return (
    cx >= rect.left &&
    cx <= rect.left + rect.width &&
    cy >= rect.top &&
    cy <= rect.top + rect.height
  );
}

/**
 * Tiny PDF Editor stores Highlight/Underline without Contents — recover text from
 * page glyphs under QuadPoints (or the annotation Rect).
 *
 * @param {PdfWord[]} words
 * @param {Array<{ left: number, top: number, width: number, height: number }>} hitRects
 */
function textFromWordsInRects(words, hitRects) {
  if (!words.length || !hitRects.length) return '';

  let selected = words.filter((word) => hitRects.some((rect) => wordCenterInCssRect(word, rect)));
  if (!selected.length) {
    // Looser fallback: any overlap with the union of hit rects.
    selected = words.filter((word) =>
      hitRects.some((rect) => {
        const right = rect.left + rect.width;
        const bottom = rect.top + rect.height;
        return word.x1 >= rect.left && word.x0 <= right && word.y1 >= rect.top && word.y0 <= bottom;
      }),
    );
  }
  if (!selected.length) return '';
  return selectionTextFromWords(selected).trim();
}

/**
 * Read Highlight / Underline annotations from a PDF (read-only preview).
 * Emits each page as soon as QuadPoints are known so the list is not blocked
 * by a full-document getTextContent scan (slow on tablet / LAN).
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {{
 *   onPage?: (entries: PdfMarkupEntry[]) => void,
 * }} [options]
 * @returns {Promise<PdfMarkupEntry[]>}
 */
export async function loadPdfMarkupAnnotations(pdf, options = {}) {
  /** @type {PdfMarkupEntry[]} */
  const entries = [];
  const onPage = typeof options.onPage === 'function' ? options.onPage : null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const annotations = await page.getAnnotations({ intent: 'display' });
    /** @type {Array<{ entry: PdfMarkupEntry, displayRects: Array<{ left: number, top: number, width: number, height: number }> }>} */
    const needWords = [];
    /** @type {PdfMarkupEntry[]} */
    const pageEntries = [];

    for (let index = 0; index < annotations.length; index += 1) {
      const annot = annotations[index];
      const subtype = String(annot?.subtype || '');
      const isHighlight = subtype === 'Highlight' || annot?.annotationType === AnnotationType.HIGHLIGHT;
      const isUnderline = subtype === 'Underline' || annot?.annotationType === AnnotationType.UNDERLINE;
      if (!isHighlight && !isUnderline) continue;

      const rect = Array.isArray(annot.rect) ? annot.rect : null;
      if (!rect || rect.length < 4) continue;

      const [x1, y1, x2, y2] = Util.normalizeRect(rect);
      const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
      const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
      const left = Math.min(vx1, vx2);
      const top = Math.min(vy1, vy2);
      const width = Math.abs(vx2 - vx1);
      const height = Math.abs(vy2 - vy1);
      if (width < 1 || height < 1) continue;

      const boundRect = { left, top, width, height };
      const quadRects = viewportRectsFromQuadPoints(
        /** @type {number[] | undefined} */ (annot.quadPoints),
        viewport,
      );
      const displayRects = quadRects.length ? quadRects : [boundRect];

      const embeddedText = String(annot.contentsObj?.str || annot.contents || '').trim();
      /** @type {PdfMarkupEntry} */
      const entry = {
        id: `pdf-${pageNumber}-${index}`,
        pageNumber,
        kind: isUnderline ? 'underline' : 'highlight',
        color: rgbArrayToCss(annot.color),
        text: embeddedText || `(${pageNumber}페이지)`,
        rects: displayRects,
        source: 'pdf',
        pdfRect: [x1, y1, x2, y2],
      };
      pageEntries.push(entry);
      if (!embeddedText) needWords.push({ entry, displayRects });
    }

    if (pageEntries.length) {
      entries.push(...pageEntries);
      onPage?.(pageEntries);
    }

    if (!needWords.length) continue;

    const pageWords = await extractPageWords(page, 0);
    /** @type {PdfMarkupEntry[]} */
    const recovered = [];
    for (const item of needWords) {
      const text = textFromWordsInRects(pageWords, item.displayRects).trim();
      if (!text) continue;
      item.entry.text = text;
      recovered.push(item.entry);
    }
    if (recovered.length) onPage?.(recovered);
  }

  return entries;
}

/**
 * Build a selectable pdf.js TextLayer on top of a rendered page.
 * Viewport must be the CSS viewport (not device-pixel buffer).
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {import('pdfjs-dist').PageViewport} cssViewport
 * @param {HTMLElement} container
 */
export async function mountPdfTextLayer(page, cssViewport, container) {
  container.replaceChildren();
  container.className = 'pdf-text-layer textLayer';
  const textContent = await getPageTextContent(page);
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container,
    viewport: cssViewport,
  });
  await textLayer.render();
  return textLayer;
}

/**
 * @param {{ x: number, y: number }} point
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {number} [pad]
 */
export function pointInSelectionRects(point, rects, pad = 0) {
  if (!point || !Array.isArray(rects) || !rects.length) return false;
  for (const rect of rects) {
    if (
      point.x >= rect.left - pad &&
      point.x <= rect.left + rect.width + pad &&
      point.y >= rect.top - pad &&
      point.y <= rect.top + rect.height + pad
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Interactive handles on the hit layer (must receive touch; selection layer is pointer-events:none).
 * @param {HTMLElement} layer
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {number} cssScale
 */
export function paintSelectionHandles(layer, rects, cssScale) {
  layer.querySelectorAll('[data-pdf-sel-handle]').forEach((node) => node.remove());
  if (!Array.isArray(rects) || !rects.length) return;
  const handles = selectionHandlePoints(rects);
  if (!handles) return;
  const scale = Math.max(0.01, cssScale || 1);
  const headPx = 18;

  for (const [role, point] of [
    ['start', handles.start],
    ['end', handles.end],
  ]) {
    const stemPx = Math.max(8, point.height * scale);
    const el = document.createElement('div');
    el.dataset.pdfSelHandle = role;
    el.className = `pdf-sel-handle pdf-sel-handle--${role}`;
    // Anchor at the top of the blue selection box; stem fills that box height.
    el.style.left = `${point.x * scale}px`;
    el.style.top = `${point.lineTop * scale}px`;
    el.style.setProperty('--pdf-sel-stem', `${stemPx}px`);
    el.style.setProperty('--pdf-sel-head', `${headPx}px`);
    el.style.height = `${headPx + stemPx}px`;
    layer.appendChild(el);
  }
}

/**
 * iPad select-mode: real tappable boxes so WebKit does not ignore an empty overlay.
 * @param {HTMLElement} layer
 * @param {PdfWord[]} words
 * @param {number} cssScale
 */
export function paintIosWordTargets(layer, words, cssScale) {
  layer.querySelectorAll('[data-pdf-word]').forEach((node) => node.remove());
  if (!Array.isArray(words) || !words.length) return;
  const scale = Math.max(0.01, cssScale || 1);
  const minCss = 36;

  // Coalesce graphemes into whitespace tokens so we do not flood the DOM.
  /** @type {Array<{ from: number, to: number, x0: number, y0: number, x1: number, y1: number, text: string }>} */
  const tokens = [];
  for (let index = 0; index < words.length; index += 1) {
    const [from, to] = tokenRangeContaining(words, index);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let text = '';
    for (let i = from; i <= to; i += 1) {
      const word = words[i];
      x0 = Math.min(x0, word.x0);
      y0 = Math.min(y0, word.y0);
      x1 = Math.max(x1, word.x1);
      y1 = Math.max(y1, word.y1);
      if (i > from && word.gapBefore) text += ' ';
      text += word.text || '';
    }
    tokens.push({ from, to, x0, y0, x1, y1, text });
    index = to;
  }

  for (const token of tokens) {
    const rawW = Math.max(4, (token.x1 - token.x0) * scale);
    const rawH = Math.max(4, (token.y1 - token.y0) * scale);
    const width = Math.max(minCss, rawW);
    const height = Math.max(minCss, rawH);
    const cx = ((token.x0 + token.x1) / 2) * scale;
    const cy = ((token.y0 + token.y1) / 2) * scale;
    const el = document.createElement('button');
    el.type = 'button';
    // Mid-token grapheme index — activateWord expands to the full token.
    el.dataset.pdfWord = String(Math.floor((token.from + token.to) / 2));
    el.className = 'pdf-ios-word';
    el.setAttribute('aria-label', token.text || '단어');
    el.style.left = `${cx - width / 2}px`;
    el.style.top = `${cy - height / 2}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    layer.appendChild(el);
  }
}

/**
 * @param {HTMLElement} layer
 */
export function clearIosWordTargets(layer) {
  if (!layer) return;
  layer.querySelectorAll('[data-pdf-word]').forEach((node) => node.remove());
}

/**
 * @param {HTMLElement} layer
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {number} cssScale
 * @param {{ showHandles?: boolean }} [options]
 */
export function paintLiveSelectionOnLayer(layer, rects, cssScale, options = {}) {
  layer.querySelectorAll('[data-pdf-sel], [data-pdf-sel-handle]').forEach((node) => node.remove());
  const scale = Math.max(0.01, cssScale || 1);
  for (const rect of rects) {
    const el = document.createElement('div');
    el.dataset.pdfSel = '1';
    el.className = 'pdf-live-selection';
    el.style.left = `${rect.left * scale}px`;
    el.style.top = `${rect.top * scale}px`;
    el.style.width = `${rect.width * scale}px`;
    el.style.height = `${rect.height * scale}px`;
    layer.appendChild(el);
  }

  // Handles are painted on the hit layer (interactive); optional visual-only copy skipped.
  void options;
}

export function clearLiveSelectionLayer(layer) {
  if (!layer) return;
  layer.querySelectorAll('[data-pdf-sel], [data-pdf-sel-handle]').forEach((node) => node.remove());
}

/**
 * Hit-test markups on a page (scale-1 coords). Last matching entry wins.
 * @param {PdfMarkupEntry[]} entries
 * @param {number} pageNumber
 * @param {{ x: number, y: number }} point
 * @returns {PdfMarkupEntry | null}
 */
export function findMarkupAtPagePoint(entries, pageNumber, point) {
  if (!entries?.length || !point) return null;
  let found = /** @type {PdfMarkupEntry | null} */ (null);
  for (const entry of entries) {
    if (entry.pageNumber !== pageNumber) continue;
    for (const rect of entry.rects) {
      if (
        point.x >= rect.left &&
        point.x <= rect.left + rect.width &&
        point.y >= rect.top &&
        point.y <= rect.top + rect.height
      ) {
        found = entry;
        break;
      }
    }
  }
  return found;
}

/**
 * Paint markup rects into a highlight layer (coords at scale 1).
 * Renders both PDF-loaded and session markups (page render uses AnnotationMode.DISABLE).
 *
 * @param {HTMLElement} layer
 * @param {PdfMarkupEntry[]} entries
 * @param {number} pageNumber
 * @param {number} cssScale
 * @param {string} [activeId]
 */
export function paintMarkupOnLayer(layer, entries, pageNumber, cssScale, activeId = '') {
  layer.querySelectorAll('[data-pdf-markup]').forEach((node) => node.remove());

  for (const entry of entries) {
    if (entry.pageNumber !== pageNumber) continue;
    const isActive = Boolean(activeId && entry.id === activeId);

    for (const rect of entry.rects) {
      const el = document.createElement('div');
      el.dataset.pdfMarkup = entry.id;
      if (entry.kind === 'underline') {
        el.className = 'pdf-markup pdf-markup--underline';
        el.style.borderBottomColor = entry.color;
      } else {
        el.className = 'pdf-markup pdf-markup--highlight';
        el.style.background = entry.color;
      }
      if (isActive) el.classList.add('pdf-markup--active');
      el.style.left = `${rect.left * cssScale}px`;
      el.style.top = `${rect.top * cssScale}px`;
      el.style.width = `${rect.width * cssScale}px`;
      el.style.height = `${rect.height * cssScale}px`;
      layer.appendChild(el);
    }
  }
}
