import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ViewerModal from './ViewerModal.jsx';
import { AppModalButton } from '../common/AppModal.jsx';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { getPdfMimeType } from '../../lib/media/mediaTypes.js';
import {
  PDF_MAX_SCALE,
  PDF_MIN_SCALE,
  computeFitHeightScale,
  computeFitPageScale,
  computeFitWidthScale,
  destroyPdfDocument,
  loadPdfDocument,
  searchPdfDocument,
  stepZoomScale,
} from '../../lib/pdf/pdfjs.js';
import { AnnotationMode } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDF_HIGHLIGHT_PRESET_LABELS,
  PDF_HIGHLIGHT_PRESET_ORDER,
  PDF_UNDERLINE_PRESET_LABELS,
  PDF_UNDERLINE_PRESET_ORDER,
  clearLiveSelectionLayer,
  clientPointToPagePoint,
  extractPageWords,
  extractWordsFromTextLayer,
  findMarkupAtPagePoint,
  getPageDisplayScale,
  getTextBlockSelection,
  loadPdfMarkupAnnotations,
  mountPdfTextLayer,
  paintLiveSelectionOnLayer,
  paintMarkupOnLayer,
  pdfHighlightPresetColor,
  pdfUnderlinePresetColor,
} from '../../lib/pdf/pdfMarkup.js';
import { loadPdfViewerSidecar, writePdfViewerSidecar } from '../../lib/pdf/pdfViewerSidecar.js';
import { downloadPdfMarkupsXlsx } from '../../lib/pdf/exportPdfMarkupsXlsx.js';
import {
  embedMarkupsIntoPdfBytes,
  isSamePdfAnnotTarget,
  viewportRectsToPdfUserRects,
} from '../../lib/pdf/embedPdfMarkups.js';
import { base64ToBytes, bytesToBase64 } from '../../lib/bytes.js';

/**
 * @typedef {'fitWidth' | 'fitHeight' | 'fitPage' | 'custom'} PdfZoomMode
 * @typedef {'thumbs' | 'marks' | null} PdfSidePanel
 */

const THUMB_CSS_WIDTH = 176;
const THUMB_MAX_CONCURRENT = 2;
const THUMB_ROOT_MARGIN = '240px 0px';
const PAGE_MAX_CONCURRENT = 2;
const PAGE_ROOT_MARGIN = '1400px 0px';
/** Shared width for thumbnail rail and highlight-marks rail. */
const PDF_SIDE_RAIL_WIDTH_PX = 220;

/**
 * Chromium-like PDF.js viewer: zoom, page nav, rotate, print, markup Excel export, search.
 *
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension?: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 * }} props
 */
export default function PdfViewerShell({
  relativePath,
  fileName,
  extension = 'pdf',
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const mimeType = getPdfMimeType(extension);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const [savingToFile, setSavingToFile] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const streamUrl = useMemo(() => {
    const base = buildMediaStreamUrl(relativePath);
    return documentEpoch > 0 ? `${base}&v=${documentEpoch}` : base;
  }, [documentEpoch, relativePath]);
  const absoluteStreamUrl = useMemo(() => {
    try {
      return new URL(streamUrl, window.location.origin).href;
    } catch {
      return streamUrl;
    }
  }, [streamUrl]);

  const thumbScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const marksListRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const pdfRef = useRef(/** @type {import('pdfjs-dist').PDFDocumentProxy | null} */ (null));
  const pageCanvasRefs = useRef(/** @type {Map<number, HTMLCanvasElement>} */ (new Map()));
  const highlightLayerRefs = useRef(/** @type {Map<number, HTMLDivElement>} */ (new Map()));
  const selectionLayerRefs = useRef(/** @type {Map<number, HTMLDivElement>} */ (new Map()));
  const textLayerRefs = useRef(/** @type {Map<number, HTMLDivElement>} */ (new Map()));
  const pageWordsRefs = useRef(
    /** @type {Map<number, import('../../lib/pdf/pdfMarkup.js').PdfWord[]>} */ (new Map()),
  );
  const pageCssScaleRef = useRef(1);
  const pageViewportRefs = useRef(
    /** @type {Map<number, import('pdfjs-dist').PageViewport>} */ (new Map()),
  );
  const searchInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const searchedQueryRef = useRef('');
  const matchesRef = useRef(/** @type {import('../../lib/pdf/pdfjs.js').PdfTextMatch[]} */ ([]));
  const activeMatchRef = useRef(-1);
  const renderTokenRef = useRef(0);
  const thumbTokenRef = useRef(0);
  const thumbObserverRef = useRef(/** @type {IntersectionObserver | null} */ (null));
  const thumbRenderedRef = useRef(/** @type {Set<number>} */ (new Set()));
  const pageObserverRef = useRef(/** @type {IntersectionObserver | null} */ (null));
  const pagePaintedRef = useRef(/** @type {Set<number>} */ (new Set()));
  const pageQueuedRef = useRef(/** @type {Set<number>} */ (new Set()));
  const pagePaintingRef = useRef(/** @type {Set<number>} */ (new Set()));
  const pageQueueRef = useRef(/** @type {number[]} */ ([]));
  const pageInFlightRef = useRef(0);
  const pageRenderTasksRef = useRef(
    /** @type {Map<number, { cancel: () => void }>} */ (new Map()),
  );
  const ignoreScrollPageSyncRef = useRef(false);
  const rotationRef = useRef(0);
  const displayScaleRef = useRef(1);
  const currentPageRef = useRef(1);

  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoomMode, setZoomMode] = useState(/** @type {PdfZoomMode} */ ('fitWidth'));
  const [customScale, setCustomScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [twoPageView, setTwoPageView] = useState(false);
  const [docReady, setDocReady] = useState(false);
  const [sidePanel, setSidePanel] = useState(/** @type {PdfSidePanel} */ ('thumbs'));
  const [highlightColorId, setHighlightColorId] = useState('yellow');
  const [underlineColorId, setUnderlineColorId] = useState('red');
  const [markups, setMarkups] = useState(
    /** @type {import('../../lib/pdf/pdfMarkup.js').PdfMarkupEntry[]} */ ([]),
  );
  const [removedPdfMarkups, setRemovedPdfMarkups] = useState(
    /** @type {import('../../lib/pdf/embedPdfMarkups.js').PdfRemovedAnnot[]} */ ([]),
  );
  const [activeMarkupId, setActiveMarkupId] = useState('');
  const [selectionMenu, setSelectionMenu] = useState(
    /** @type {{
     *   clientX: number,
     *   clientY: number,
     *   pageNumber: number,
     *   text: string,
     *   rects: Array<{ left: number, top: number, width: number, height: number }>,
     * } | null} */ (null),
  );
  const [marksContextMenu, setMarksContextMenu] = useState(
    /** @type {{
     *   clientX: number,
     *   clientY: number,
     *   entryId: string,
     *   canDelete: boolean,
     * } | null} */ (null),
  );
  const markupsRef = useRef(markups);
  const removedPdfMarkupsRef = useRef(removedPdfMarkups);
  const activeMarkupIdRef = useRef(activeMarkupId);
  const highlightColorIdRef = useRef(highlightColorId);
  const underlineColorIdRef = useRef(underlineColorId);
  const selectionDragRef = useRef(
    /** @type {{
     *   pageNumber: number,
     *   anchor: { x: number, y: number },
     *   moved: boolean,
     *   selection: import('../../lib/pdf/pdfMarkup.js').PdfTextSelection | null,
     *   pendingMarkupId?: string,
     * } | null} */ (null),
  );
  /** Skip autosave until initial sidecar restore finishes. */
  const skipViewerSaveRef = useRef(true);
  /** Page to restore after first layout (from sidecar). */
  const pendingRestorePageRef = useRef(/** @type {number | null} */ (null));
  const viewerSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const zoomModeRef = useRef(zoomMode);
  const customScaleRef = useRef(customScale);
  const twoPageViewRef = useRef(twoPageView);

  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState(/** @type {import('../../lib/pdf/pdfjs.js').PdfTextMatch[]} */ ([]));
  const [activeMatch, setActiveMatch] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  rotationRef.current = rotation;
  displayScaleRef.current = displayScale;
  matchesRef.current = matches;
  activeMatchRef.current = activeMatch;
  currentPageRef.current = currentPage;
  markupsRef.current = markups;
  removedPdfMarkupsRef.current = removedPdfMarkups;
  activeMarkupIdRef.current = activeMarkupId;
  highlightColorIdRef.current = highlightColorId;
  underlineColorIdRef.current = underlineColorId;
  zoomModeRef.current = zoomMode;
  customScaleRef.current = customScale;
  twoPageViewRef.current = twoPageView;

  const showThumbnails = sidePanel === 'thumbs';
  const showMarksPanel = sidePanel === 'marks';

  const toggleSidePanel = useCallback((panel) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const repaintMarkupLayers = useCallback(() => {
    for (const [pageNumber, layer] of highlightLayerRefs.current.entries()) {
      const pageWrap = scrollRef.current?.querySelector(`[data-pdf-page="${pageNumber}"]`);
      const scale =
        pageWrap instanceof HTMLElement
          ? getPageDisplayScale(pageWrap, pageCssScaleRef.current || displayScaleRef.current || 1)
          : pageCssScaleRef.current || displayScaleRef.current || 1;
      paintMarkupOnLayer(
        layer,
        markupsRef.current,
        pageNumber,
        scale,
        activeMarkupIdRef.current,
      );
    }
  }, []);

  const clearHighlights = useCallback(() => {
    for (const layer of highlightLayerRefs.current.values()) {
      layer.querySelectorAll('.pdf-search-hit').forEach((node) => node.remove());
    }
  }, []);

  /**
   * @param {import('../../lib/pdf/pdfjs.js').PdfTextMatch} match
   */
  const getMatchBox = useCallback((match) => {
    const viewport = pageViewportRefs.current.get(match.pageNumber);
    const canvas = pageCanvasRefs.current.get(match.pageNumber);
    if (!viewport || !canvas) return null;

    const [a, b, , , e, f] = match.transform;
    const [vx, vy] = viewport.convertToViewportPoint(e, f);
    const fontSize = Math.max(8, Math.hypot(a, b) * viewport.scale);
    const w = Math.max(6, match.width * viewport.scale);
    const h = Math.max(fontSize * 0.85, match.height * viewport.scale * 0.85);
    const rot = ((rotationRef.current % 360) + 360) % 360;

    if (rot === 90) return { x: vx - h, y: vy, width: h, height: w };
    if (rot === 180) return { x: vx - w, y: vy, width: w, height: h };
    if (rot === 270) return { x: vx, y: vy - w, width: h, height: w };
    return { x: vx, y: vy - h, width: w, height: h };
  }, []);

  const paintHighlight = useCallback(
    (match, active) => {
      const layer = highlightLayerRefs.current.get(match.pageNumber);
      const canvas = pageCanvasRefs.current.get(match.pageNumber);
      const box = getMatchBox(match);
      if (!layer || !canvas || !box || !canvas.width || !canvas.height) return;

      const mark = document.createElement('div');
      mark.className = active ? 'pdf-search-hit pdf-search-hit--active' : 'pdf-search-hit';
      mark.style.left = `${(box.x / canvas.width) * 100}%`;
      mark.style.top = `${(box.y / canvas.height) * 100}%`;
      mark.style.width = `${(box.width / canvas.width) * 100}%`;
      mark.style.height = `${(box.height / canvas.height) * 100}%`;
      layer.appendChild(mark);
    },
    [getMatchBox],
  );

  const scrollMatchIntoView = useCallback(
    (match) => {
      const scroller = scrollRef.current;
      const pageEl = scroller?.querySelector(`[data-pdf-page="${match.pageNumber}"]`);
      const canvas = pageCanvasRefs.current.get(match.pageNumber);
      const box = getMatchBox(match);
      if (!scroller || !pageEl || !canvas || !box) return;

      const displayHeight = canvas.clientHeight || canvas.height;
      const sy = displayHeight / canvas.height || 1;
      const matchTopInPage = box.y * sy;
      const matchHeight = box.height * sy;
      const scrollerRect = scroller.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const matchTop = pageRect.top - scrollerRect.top + scroller.scrollTop + matchTopInPage;
      const matchBottom = matchTop + matchHeight;
      const padding = 56;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;

      ignoreScrollPageSyncRef.current = true;
      if (matchTop < viewTop + padding) {
        scroller.scrollTo({ top: Math.max(0, matchTop - padding), behavior: 'smooth' });
      } else if (matchBottom > viewBottom - padding) {
        const nextTop = matchTop - Math.max(padding, scroller.clientHeight * 0.35);
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      }
      window.setTimeout(() => {
        ignoreScrollPageSyncRef.current = false;
      }, 400);
    },
    [getMatchBox],
  );

  const showMatch = useCallback(
    (index, list = matchesRef.current) => {
      if (!list.length) {
        clearHighlights();
        setActiveMatch(-1);
        activeMatchRef.current = -1;
        return;
      }
      const safeIndex = ((index % list.length) + list.length) % list.length;
      setActiveMatch(safeIndex);
      activeMatchRef.current = safeIndex;
      clearHighlights();

      const current = list[safeIndex];
      setCurrentPage(current.pageNumber);
      setPageInput(String(current.pageNumber));

      for (let i = 0; i < list.length; i += 1) {
        const match = list[i];
        if (match.pageNumber !== current.pageNumber) continue;
        paintHighlight(match, i === safeIndex);
      }

      requestAnimationFrame(() => {
        scrollMatchIntoView(current);
      });
    },
    [clearHighlights, paintHighlight, scrollMatchIntoView],
  );

  const reapplyActiveHighlights = useCallback(() => {
    const list = matchesRef.current;
    const index = activeMatchRef.current;
    if (!list.length || index < 0) return;
    showMatch(index, list);
  }, [showMatch]);

  const clearSearch = useCallback(() => {
    searchedQueryRef.current = '';
    setMatches([]);
    matchesRef.current = [];
    setActiveMatch(-1);
    activeMatchRef.current = -1;
    setSearchMessage('');
    clearHighlights();
  }, [clearHighlights]);

  const resolveRenderScale = useCallback(async (pdf, mode, custom, rot, twoUp) => {
    const page = await pdf.getPage(1);
    const scroller = scrollRef.current;
    const gap = twoUp ? 12 : 0;
    const width = Math.max(240, (scroller?.clientWidth ?? 800) - 48);
    const height = Math.max(240, (scroller?.clientHeight ?? 600) - 24);
    const pageWidthBudget = twoUp ? Math.max(120, (width - gap) / 2) : width;

    if (mode === 'fitWidth') return computeFitWidthScale(page, pageWidthBudget, rot);
    if (mode === 'fitHeight') return computeFitHeightScale(page, height, rot);
    if (mode === 'fitPage') {
      return computeFitPageScale(page, { width: pageWidthBudget, height }, rot);
    }
    return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, custom));
  }, []);

  const cancelPageRenders = useCallback(() => {
    pageObserverRef.current?.disconnect();
    pageObserverRef.current = null;
    for (const task of pageRenderTasksRef.current.values()) {
      try {
        task.cancel();
      } catch {
        // ignore
      }
    }
    pageRenderTasksRef.current.clear();
    pagePaintedRef.current.clear();
    pageQueuedRef.current.clear();
    pagePaintingRef.current.clear();
    pageQueueRef.current = [];
    pageInFlightRef.current = 0;
  }, []);

  const renderAllPages = useCallback(
    async (pdf, { mode, custom, rot, twoUp = false }) => {
      const container = scrollRef.current;
      if (!container || !pdf) return;

      const token = ++renderTokenRef.current;
      cancelPageRenders();
      setRendering(true);

      try {
        const nextScale = await resolveRenderScale(pdf, mode, custom, rot, twoUp);
        if (token !== renderTokenRef.current) return;

        setDisplayScale(nextScale);
        displayScaleRef.current = nextScale;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bufferScale = nextScale * dpr;
        const keepPage = currentPageRef.current;

        container.replaceChildren();
        container.classList.toggle('pdf-scroll--two-up', Boolean(twoUp));
        pageCanvasRefs.current.clear();
        highlightLayerRefs.current.clear();
        selectionLayerRefs.current.clear();
        textLayerRefs.current.clear();
        pageWordsRefs.current.clear();
        pageViewportRefs.current.clear();
        pageCssScaleRef.current = nextScale;
        setSelectionMenu(null);
        selectionDragRef.current = null;

        // Shells from page 1 size so the scroll layout appears immediately.
        const firstPage = await pdf.getPage(1);
        if (token !== renderTokenRef.current) return;
        const firstCss = firstPage.getViewport({ scale: nextScale, rotation: rot });
        const shellWidth = Math.max(1, Math.floor(firstCss.width));
        const shellHeight = Math.max(1, Math.floor(firstCss.height));

        /** @type {HTMLDivElement | null} */
        let spreadRow = null;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const pageWrap = document.createElement('div');
          pageWrap.className = 'pdf-page-wrap';
          pageWrap.dataset.pdfPage = String(pageNumber);
          pageWrap.dataset.pdfReady = '0';
          pageWrap.style.width = `${shellWidth}px`;
          pageWrap.style.height = `${shellHeight}px`;

          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          pageCanvasRefs.current.set(pageNumber, canvas);

          const highlightLayer = document.createElement('div');
          highlightLayer.className = 'pdf-highlight-layer';
          highlightLayerRefs.current.set(pageNumber, highlightLayer);

          const selectionLayer = document.createElement('div');
          selectionLayer.className = 'pdf-selection-layer';
          selectionLayerRefs.current.set(pageNumber, selectionLayer);

          const textLayer = document.createElement('div');
          textLayer.className = 'pdf-text-layer textLayer';
          textLayer.style.pointerEvents = 'none';
          textLayerRefs.current.set(pageNumber, textLayer);

          const hitLayer = document.createElement('div');
          hitLayer.className = 'pdf-hit-layer';
          hitLayer.dataset.pdfHit = '1';
          hitLayer.style.pointerEvents = 'none';

          pageWrap.append(canvas, highlightLayer, selectionLayer, textLayer, hitLayer);

          if (twoUp) {
            if (!spreadRow || spreadRow.childElementCount >= 2) {
              spreadRow = document.createElement('div');
              spreadRow.className = 'pdf-spread-row';
              container.appendChild(spreadRow);
            }
            spreadRow.appendChild(pageWrap);
          } else {
            container.appendChild(pageWrap);
          }
        }

        if (token !== renderTokenRef.current) return;

        const pageEl = container.querySelector(`[data-pdf-page="${keepPage}"]`);
        if (pageEl) {
          ignoreScrollPageSyncRef.current = true;
          pageEl.scrollIntoView({ block: 'start' });
          window.setTimeout(() => {
            ignoreScrollPageSyncRef.current = false;
          }, 50);
        }

        // Unlock UI; paint only nearby pages via IntersectionObserver.
        setRendering(false);

        const drain = () => {
          if (token !== renderTokenRef.current) return;
          while (pageInFlightRef.current < PAGE_MAX_CONCURRENT && pageQueueRef.current.length > 0) {
            const pageNumber = pageQueueRef.current.shift();
            if (typeof pageNumber !== 'number') break;
            pageQueuedRef.current.delete(pageNumber);
            if (pagePaintedRef.current.has(pageNumber) || pagePaintingRef.current.has(pageNumber)) {
              continue;
            }
            pagePaintingRef.current.add(pageNumber);
            pageInFlightRef.current += 1;
            void paintPage(pageNumber).finally(() => {
              pagePaintingRef.current.delete(pageNumber);
              pageInFlightRef.current = Math.max(0, pageInFlightRef.current - 1);
              drain();
            });
          }
        };

        /**
         * @param {number} pageNumber
         */
        const enqueue = (pageNumber) => {
          if (
            token !== renderTokenRef.current ||
            pagePaintedRef.current.has(pageNumber) ||
            pagePaintingRef.current.has(pageNumber) ||
            pageQueuedRef.current.has(pageNumber)
          ) {
            return;
          }
          pageQueuedRef.current.add(pageNumber);
          pageQueueRef.current.push(pageNumber);
          drain();
        };

        /**
         * @param {number} pageNumber
         */
        const paintPage = async (pageNumber) => {
          if (token !== renderTokenRef.current || pagePaintedRef.current.has(pageNumber)) return;

          const pageWrap = container.querySelector(`[data-pdf-page="${pageNumber}"]`);
          const canvas = pageCanvasRefs.current.get(pageNumber);
          const highlightLayer = highlightLayerRefs.current.get(pageNumber);
          const textLayer = textLayerRefs.current.get(pageNumber);
          if (!(pageWrap instanceof HTMLElement) || !canvas || !highlightLayer || !textLayer) {
            return;
          }

          try {
            const page = await pdf.getPage(pageNumber);
            if (token !== renderTokenRef.current) return;

            const viewport = page.getViewport({ scale: bufferScale, rotation: rot });
            const cssViewport = page.getViewport({ scale: nextScale, rotation: rot });
            const baseViewport = page.getViewport({ scale: 1, rotation: rot });
            const cssWidth = Math.floor(viewport.width / dpr);
            const cssHeight = Math.floor(viewport.height / dpr);

            pageWrap.dataset.pdfBaseWidth = String(baseViewport.width);
            pageWrap.dataset.pdfBaseHeight = String(baseViewport.height);
            pageWrap.style.width = `${cssWidth}px`;
            pageWrap.style.height = `${cssHeight}px`;
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            // Keep intrinsic box in sync with wrap; CSS may shrink via max-width:100%.
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            pageViewportRefs.current.set(pageNumber, viewport);

            const syncWrapHeight = () => {
              if (!(pageWrap instanceof HTMLElement)) return;
              const painted = canvas.clientHeight;
              if (painted > 0) pageWrap.style.height = `${painted}px`;
            };
            syncWrapHeight();
            requestAnimationFrame(syncWrapHeight);

            const context = canvas.getContext('2d', { alpha: false });
            if (!context) return;

            const prevTask = pageRenderTasksRef.current.get(pageNumber);
            if (prevTask) {
              try {
                prevTask.cancel();
              } catch {
                // ignore
              }
              pageRenderTasksRef.current.delete(pageNumber);
            }

            const task = page.render({
              canvasContext: context,
              viewport,
              canvas,
              // We paint Highlight/Underline ourselves so list select/delete stays in sync.
              annotationMode: AnnotationMode.DISABLE,
            });
            pageRenderTasksRef.current.set(pageNumber, task);
            await task.promise;
            pageRenderTasksRef.current.delete(pageNumber);
            if (token !== renderTokenRef.current) return;

            const displayScale = getPageDisplayScale(pageWrap, nextScale);
            paintMarkupOnLayer(
              highlightLayer,
              markupsRef.current,
              pageNumber,
              displayScale,
              activeMarkupIdRef.current,
            );
            pageWrap.dataset.pdfReady = '1';
            pagePaintedRef.current.add(pageNumber);
            reapplyActiveHighlights();

            // PDF text metrics are stable for fit-width; text-layer spans can drift when CSS shrinks.
            void (async () => {
              try {
                await mountPdfTextLayer(page, cssViewport, textLayer);
                if (token !== renderTokenRef.current) return;
                textLayer.style.pointerEvents = 'none';

                let words = await extractPageWords(page, rot);
                if (!words.length) {
                  words = extractWordsFromTextLayer(textLayer, pageWrap, nextScale);
                }
                if (token !== renderTokenRef.current) return;
                pageWordsRefs.current.set(pageNumber, words);
                pageWrap.dataset.pdfSelectable = words.length ? '1' : '0';
                const hit = pageWrap.querySelector('[data-pdf-hit="1"]');
                if (hit instanceof HTMLElement) {
                  hit.style.pointerEvents = words.length ? 'auto' : 'none';
                }
              } catch (err) {
                console.warn('[pdf] text/selection layer failed:', err);
                try {
                  const words = await extractPageWords(page, rot);
                  if (token !== renderTokenRef.current) return;
                  pageWordsRefs.current.set(pageNumber, words);
                  pageWrap.dataset.pdfSelectable = words.length ? '1' : '0';
                  const hit = pageWrap.querySelector('[data-pdf-hit="1"]');
                  if (hit instanceof HTMLElement) {
                    hit.style.pointerEvents = words.length ? 'auto' : 'none';
                  }
                } catch (inner) {
                  console.warn('[pdf] word extract failed:', inner);
                }
              }
            })();
          } catch (err) {
            pageRenderTasksRef.current.delete(pageNumber);
            if (token !== renderTokenRef.current) return;
            const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
            if (name !== 'RenderingCancelledException') {
              console.warn('[pdf] page paint failed:', err);
            }
          }
        };

        const observer = new IntersectionObserver(
          (entries) => {
            if (token !== renderTokenRef.current) return;
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const target = entry.target;
              if (!(target instanceof HTMLElement)) continue;
              const pageNumber = Number(target.dataset.pdfPage || '0');
              if (pageNumber > 0) enqueue(pageNumber);
            }
          },
          { root: container, rootMargin: PAGE_ROOT_MARGIN, threshold: 0.01 },
        );
        pageObserverRef.current = observer;
        container.querySelectorAll('[data-pdf-page]').forEach((node) => observer.observe(node));

        enqueue(keepPage);
        if (keepPage > 1) enqueue(keepPage - 1);
        if (keepPage < pdf.numPages) enqueue(keepPage + 1);
      } catch (err) {
        if (token === renderTokenRef.current) {
          setRendering(false);
          setLoadError(err instanceof Error ? err.message : 'PDF 렌더링에 실패했습니다.');
        }
      }
    },
    [cancelPageRenders, reapplyActiveHighlights, resolveRenderScale],
  );

  const teardownThumbnails = useCallback(() => {
    thumbTokenRef.current += 1;
    thumbObserverRef.current?.disconnect();
    thumbObserverRef.current = null;
    thumbRenderedRef.current.clear();
    const container = thumbScrollRef.current;
    if (container) container.replaceChildren();
  }, []);

  /** Placeholders for all pages; canvas paint only for visible (near) items. */
  const setupThumbnailRail = useCallback(
    async (pdf, rot) => {
      const container = thumbScrollRef.current;
      if (!container || !pdf) return;

      teardownThumbnails();
      const token = ++thumbTokenRef.current;

      /** @type {number[]} */
      const queue = [];
      const queued = new Set();
      let inFlight = 0;

      const drain = () => {
        if (token !== thumbTokenRef.current) return;
        while (inFlight < THUMB_MAX_CONCURRENT && queue.length > 0) {
          const pageNumber = queue.shift();
          if (typeof pageNumber !== 'number') break;
          queued.delete(pageNumber);
          if (thumbRenderedRef.current.has(pageNumber)) continue;
          inFlight += 1;
          void paint(pageNumber).finally(() => {
            inFlight = Math.max(0, inFlight - 1);
            drain();
          });
        }
      };

      /**
       * @param {number} pageNumber
       */
      const enqueue = (pageNumber) => {
        if (
          token !== thumbTokenRef.current ||
          thumbRenderedRef.current.has(pageNumber) ||
          queued.has(pageNumber)
        ) {
          return;
        }
        queued.add(pageNumber);
        queue.push(pageNumber);
        drain();
      };

      /**
       * @param {number} pageNumber
       */
      const paint = async (pageNumber) => {
        if (token !== thumbTokenRef.current) return;
        const button = container.querySelector(`[data-pdf-thumb-page="${pageNumber}"]`);
        if (!(button instanceof HTMLElement) || button.dataset.pdfThumbReady === '1') {
          return;
        }
        const canvas = button.querySelector('canvas.pdf-thumb-canvas');
        if (!(canvas instanceof HTMLCanvasElement)) return;

        try {
          const page = await pdf.getPage(pageNumber);
          if (token !== thumbTokenRef.current) return;

          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const base = page.getViewport({ scale: 1, rotation: rot });
          const scale = THUMB_CSS_WIDTH / base.width;
          const bufferScale = scale * dpr;
          const viewport = page.getViewport({ scale: bufferScale, rotation: rot });
          const cssWidth = Math.floor(viewport.width / dpr);
          const cssHeight = Math.floor(viewport.height / dpr);

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;

          const placeholder = button.querySelector('.pdf-thumb-placeholder');
          if (placeholder instanceof HTMLElement) {
            placeholder.style.width = `${cssWidth}px`;
            placeholder.style.height = `${cssHeight}px`;
          }

          const context = canvas.getContext('2d', { alpha: false });
          if (!context) return;
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          if (token !== thumbTokenRef.current) return;

          // Toggle via data attribute + CSS (class `display` overrides HTML `hidden`).
          button.dataset.pdfThumbReady = '1';
          thumbRenderedRef.current.add(pageNumber);
        } catch {
          // Keep placeholder on cancel / transient errors.
        }
      };

      let placeholderHeight = Math.round(THUMB_CSS_WIDTH * 1.414);
      try {
        const first = await pdf.getPage(1);
        if (token !== thumbTokenRef.current) return;
        const base = first.getViewport({ scale: 1, rotation: rot });
        placeholderHeight = Math.max(48, Math.round((THUMB_CSS_WIDTH / base.width) * base.height));
      } catch {
        // Keep default aspect.
      }

      if (token !== thumbTokenRef.current) return;

      const activePage = currentPageRef.current;
      const frag = document.createDocumentFragment();

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
          pageNumber === activePage ? 'pdf-thumb-item pdf-thumb-item--active' : 'pdf-thumb-item';
        button.dataset.pdfThumbPage = String(pageNumber);
        button.dataset.pdfThumbReady = '0';
        button.title = `${pageNumber}페이지`;
        button.setAttribute('aria-label', `${pageNumber}페이지로 이동`);

        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-thumb-placeholder';
        placeholder.style.width = `${THUMB_CSS_WIDTH}px`;
        placeholder.style.height = `${placeholderHeight}px`;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-thumb-canvas';

        const label = document.createElement('span');
        label.className = 'pdf-thumb-label';
        label.textContent = String(pageNumber);

        button.append(placeholder, canvas, label);
        frag.appendChild(button);
      }

      container.replaceChildren(frag);

      const observer = new IntersectionObserver(
        (entries) => {
          if (token !== thumbTokenRef.current) return;
          for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement)) continue;
            const pageNumber = Number(entry.target.dataset.pdfThumbPage || '0');
            if (pageNumber < 1) continue;

            if (entry.isIntersecting) {
              enqueue(pageNumber);
              continue;
            }

            // Release far-away canvases so large PDFs do not keep every thumb in GPU/CPU memory.
            if (
              entry.target.dataset.pdfThumbReady === '1' &&
              Math.abs(pageNumber - currentPageRef.current) > 12
            ) {
              const canvas = entry.target.querySelector('canvas.pdf-thumb-canvas');
              if (canvas instanceof HTMLCanvasElement) {
                canvas.width = 0;
                canvas.height = 0;
              }
              entry.target.dataset.pdfThumbReady = '0';
              thumbRenderedRef.current.delete(pageNumber);
            }
          }
        },
        { root: container, rootMargin: THUMB_ROOT_MARGIN, threshold: 0.01 },
      );
      thumbObserverRef.current = observer;

      container.querySelectorAll('[data-pdf-thumb-page]').forEach((node) => {
        if (node instanceof HTMLElement) observer.observe(node);
      });

      const activeThumb = container.querySelector(`[data-pdf-thumb-page="${activePage}"]`);
      if (activeThumb instanceof HTMLElement) {
        activeThumb.scrollIntoView({ block: 'nearest' });
      }
    },
    [teardownThumbnails],
  );

  // Load document once per stream URL; merge embedded + sidecar markups / view.
  useEffect(() => {
    let cancelled = false;
    /** @type {import('pdfjs-dist').PDFDocumentProxy | null} */
    let pdf = null;

    async function load() {
      setLoading(true);
      setLoadError(null);
      setPageCount(0);
      setCurrentPage(1);
      setPageInput('1');
      setDocReady(false);
      clearSearch();
      setMarkups([]);
      setRemovedPdfMarkups([]);
      setActiveMarkupId('');
      pdfRef.current = null;
      skipViewerSaveRef.current = true;
      pendingRestorePageRef.current = null;

      try {
        const [loadedPdf, sidecar] = await Promise.all([
          loadPdfDocument(streamUrl),
          loadPdfViewerSidecar(relativePath),
        ]);
        pdf = loadedPdf;
        if (cancelled) {
          await destroyPdfDocument(pdf);
          return;
        }

        const view = sidecar?.view;
        if (view?.zoomMode) setZoomMode(view.zoomMode);
        if (typeof view?.customScale === 'number' && view.customScale > 0) {
          setCustomScale(view.customScale);
        }
        if (typeof view?.rotation === 'number') setRotation(view.rotation);
        if (typeof view?.twoPageView === 'boolean') setTwoPageView(view.twoPageView);
        // Set current page before first layout so renderAllPages keepPage is correct.
        // Scroll jump still waits until shells exist (pendingRestorePageRef).
        if (typeof view?.page === 'number' && view.page >= 1) {
          const savedPage = Math.min(pdf.numPages, Math.max(1, Math.round(view.page)));
          pendingRestorePageRef.current = savedPage;
          setCurrentPage(savedPage);
          setPageInput(String(savedPage));
        }

        const savedMarkups = Array.isArray(sidecar?.markups) ? sidecar.markups : [];
        const removed = Array.isArray(sidecar?.removed) ? sidecar.removed : [];
        setRemovedPdfMarkups(removed);

        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setDocReady(true);
        setLoading(false);

        // Markup scan walks every page — keep it off the critical path.
        void loadPdfMarkupAnnotations(pdf)
          .then((embedded) => {
            if (cancelled) return;
            const visible = embedded.filter(
              (entry) => !removed.some((target) => isSamePdfAnnotTarget(entry, target)),
            );
            setMarkups([...visible, ...savedMarkups]);
          })
          .catch((err) => {
            console.warn('[pdf] markup load failed:', err);
            if (!cancelled) setMarkups([...savedMarkups]);
          });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'PDF를 표시할 수 없습니다.');
          setLoading(false);
          skipViewerSaveRef.current = false;
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      renderTokenRef.current += 1;
      cancelPageRenders();
      teardownThumbnails();
      pdfRef.current = null;
      void destroyPdfDocument(pdf);
    };
  }, [cancelPageRenders, clearSearch, relativePath, streamUrl, teardownThumbnails]);

  // After first layout, jump to saved page then enable autosave.
  // Keep pendingRestorePageRef until scroll succeeds — ResizeObserver / zoom
  // re-renders cancel the timer via cleanup; clearing pending early left the
  // viewer on page 1 and autosave overwrote the sidecar.
  useEffect(() => {
    if (!docReady || loading || rendering || !pageCount) return undefined;

    const pendingPage = pendingRestorePageRef.current;
    if (pendingPage == null) {
      skipViewerSaveRef.current = false;
      return undefined;
    }

    const target = Math.min(pageCount, Math.max(1, Math.round(pendingPage)));

    const timer = window.setTimeout(() => {
      const scroller = scrollRef.current;
      const pageEl = scroller?.querySelector(`[data-pdf-page="${target}"]`);
      if (!(pageEl instanceof HTMLElement)) {
        // Shells not ready yet; leave pending for the next settled render.
        return;
      }

      pendingRestorePageRef.current = null;
      setCurrentPage(target);
      setPageInput(String(target));
      ignoreScrollPageSyncRef.current = true;
      pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
      window.setTimeout(() => {
        ignoreScrollPageSyncRef.current = false;
        skipViewerSaveRef.current = false;
      }, 250);
    }, 60);

    return () => window.clearTimeout(timer);
  }, [docReady, loading, pageCount, rendering]);

  const persistViewerState = useCallback(async () => {
    if (skipViewerSaveRef.current || !relativePath) return;
    try {
      await writePdfViewerSidecar(relativePath, {
        view: {
          page: currentPageRef.current,
          zoomMode: zoomModeRef.current,
          customScale: customScaleRef.current,
          rotation: rotationRef.current,
          twoPageView: twoPageViewRef.current,
        },
        markups: markupsRef.current.filter((entry) => entry.source !== 'pdf'),
        removed: removedPdfMarkupsRef.current,
      });
    } catch (err) {
      console.warn('[pdf] viewer state save failed:', err);
    }
  }, [relativePath]);

  const scheduleViewerSave = useCallback(() => {
    if (skipViewerSaveRef.current) return;
    if (viewerSaveTimerRef.current) window.clearTimeout(viewerSaveTimerRef.current);
    viewerSaveTimerRef.current = window.setTimeout(() => {
      viewerSaveTimerRef.current = null;
      void persistViewerState();
    }, 450);
  }, [persistViewerState]);

  useEffect(() => {
    scheduleViewerSave();
  }, [markups, removedPdfMarkups, currentPage, zoomMode, customScale, rotation, twoPageView, scheduleViewerSave]);

  useEffect(
    () => () => {
      if (viewerSaveTimerRef.current) {
        window.clearTimeout(viewerSaveTimerRef.current);
        viewerSaveTimerRef.current = null;
      }
      void persistViewerState();
    },
    [persistViewerState],
  );
  // Re-render when zoom mode / custom scale / rotation / two-up changes (and on first ready).
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!docReady || !pdf || loading) return;
    void renderAllPages(pdf, {
      mode: zoomMode,
      custom: customScale,
      rot: rotation,
      twoUp: twoPageView,
    });
  }, [customScale, docReady, loading, renderAllPages, rotation, twoPageView, zoomMode]);

  // Thumbnails: placeholders + lazy paint (visible only). Rebuild on rotation / toggle.
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!docReady || !pdf || loading) return undefined;
    if (!showThumbnails) {
      teardownThumbnails();
      return undefined;
    }
    void setupThumbnailRail(pdf, rotation);
    return () => {
      teardownThumbnails();
    };
  }, [docReady, loading, rotation, setupThumbnailRail, showThumbnails, teardownThumbnails]);

  // Keep active thumbnail in view.
  useEffect(() => {
    if (!showThumbnails || !currentPage) return;
    const container = thumbScrollRef.current;
    const thumb = container?.querySelector(`[data-pdf-thumb-page="${currentPage}"]`);
    if (!(thumb instanceof HTMLElement) || !container) return;

    container.querySelectorAll('.pdf-thumb-item--active').forEach((node) => {
      node.classList.remove('pdf-thumb-item--active');
    });
    thumb.classList.add('pdf-thumb-item--active');

    const top = thumb.offsetTop;
    const bottom = top + thumb.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (top < viewTop + 8) {
      container.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
    } else if (bottom > viewBottom - 8) {
      container.scrollTo({ top: bottom - container.clientHeight + 8, behavior: 'smooth' });
    }
  }, [currentPage, showThumbnails, rendering]);

  // Track current page from scroll.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !pageCount) return undefined;

    const onScroll = () => {
      if (ignoreScrollPageSyncRef.current) return;
      const pages = scroller.querySelectorAll('[data-pdf-page]');
      if (!pages.length) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const midY = scroller.scrollTop + scroller.clientHeight * 0.35;
      const midX = scroller.scrollLeft + scroller.clientWidth * 0.5;
      let best = 1;
      let bestDist = Infinity;
      pages.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const rect = node.getBoundingClientRect();
        const pageTop = rect.top - scrollerRect.top + scroller.scrollTop;
        const pageLeft = rect.left - scrollerRect.left + scroller.scrollLeft;
        const pageCenterY = pageTop + rect.height * 0.5;
        const pageCenterX = pageLeft + rect.width * 0.5;
        const dy = pageCenterY - midY;
        const dx = pageCenterX - midX;
        const dist = dy * dy + dx * dx * 0.25;
        const pageNumber = Number(node.dataset.pdfPage || '1');
        if (dist < bestDist) {
          bestDist = dist;
          best = pageNumber;
        }
      });
      setCurrentPage((prev) => {
        if (prev === best) return prev;
        setPageInput(String(best));
        return best;
      });
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [pageCount, rendering, twoPageView]);

  // Resize refreshes fit modes only.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !docReady) return undefined;

    let timer = 0;
    const observer = new ResizeObserver(() => {
      if (zoomMode === 'custom') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const pdf = pdfRef.current;
        if (!pdf) return;
        void renderAllPages(pdf, {
          mode: zoomMode,
          custom: customScale,
          rot: rotation,
          twoUp: twoPageView,
        });
      }, 120);
    });
    observer.observe(scroller);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [customScale, docReady, renderAllPages, rotation, twoPageView, zoomMode]);

  const goToPage = useCallback(
    (pageNumber) => {
      const scroller = scrollRef.current;
      if (!scroller || !pageCount) return;
      const target = Math.min(pageCount, Math.max(1, Math.round(pageNumber)));
      const pageEl = scroller.querySelector(`[data-pdf-page="${target}"]`);
      if (!pageEl) return;
      setCurrentPage(target);
      setPageInput(String(target));
      ignoreScrollPageSyncRef.current = true;
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        ignoreScrollPageSyncRef.current = false;
      }, 400);
    },
    [pageCount],
  );

  const zoomBy = useCallback((direction) => {
    const next = stepZoomScale(displayScaleRef.current, direction);
    setZoomMode('custom');
    setCustomScale(next);
  }, []);

  const setFitWidth = useCallback(() => setZoomMode('fitWidth'), []);
  const setFitHeight = useCallback(() => setZoomMode('fitHeight'), []);
  const setFitPage = useCallback(() => setZoomMode('fitPage'), []);
  const toggleTwoPageView = useCallback(() => {
    setTwoPageView((prev) => !prev);
  }, []);
  const resetZoom = useCallback(() => {
    setZoomMode('custom');
    setCustomScale(1);
  }, []);
  const rotateClockwise = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const clearAllLiveSelections = useCallback(() => {
    for (const layer of selectionLayerRefs.current.values()) {
      clearLiveSelectionLayer(layer);
    }
  }, []);

  const closeSelectionMenu = useCallback(() => {
    setSelectionMenu(null);
  }, []);

  const closeMarksContextMenu = useCallback(() => {
    setMarksContextMenu(null);
  }, []);

  const selectionMenuRef = useRef(selectionMenu);
  selectionMenuRef.current = selectionMenu;

  const showMarkupSelection = useCallback(
    (entry) => {
      if (!entry) return;
      clearAllLiveSelections();
      const pageWrap = scrollRef.current?.querySelector(`[data-pdf-page="${entry.pageNumber}"]`);
      const scale =
        pageWrap instanceof HTMLElement
          ? getPageDisplayScale(pageWrap, pageCssScaleRef.current || displayScaleRef.current || 1)
          : pageCssScaleRef.current || displayScaleRef.current || 1;
      const layer = selectionLayerRefs.current.get(entry.pageNumber);
      if (layer) paintLiveSelectionOnLayer(layer, entry.rects, scale);

      const scroller = scrollRef.current;
      if (scroller && pageWrap instanceof HTMLElement && entry.rects[0]) {
        const pageBox = pageWrap.getBoundingClientRect();
        const scrollerBox = scroller.getBoundingClientRect();
        const top =
          pageBox.top -
          scrollerBox.top +
          scroller.scrollTop +
          entry.rects[0].top * scale -
          72;
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }

      const row = marksListRef.current?.querySelector(
        `[data-markup-id="${CSS.escape(entry.id)}"]`,
      );
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [clearAllLiveSelections],
  );

  const selectMarkupEntry = useCallback(
    (entry) => {
      if (!entry) return;
      setActiveMarkupId(entry.id);
      setSidePanel('marks');
      setSelectionMenu(null);
      setMarksContextMenu(null);
      selectionDragRef.current = null;
      window.getSelection()?.removeAllRanges();
      goToPage(entry.pageNumber);
      window.setTimeout(() => showMarkupSelection(entry), 120);
    },
    [goToPage, showMarkupSelection],
  );

  const selectMarkupEntryRef = useRef(selectMarkupEntry);
  selectMarkupEntryRef.current = selectMarkupEntry;

  const openMarksContextMenu = useCallback(
    (event, entry) => {
      if (!entry) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectionMenu(null);
      setActiveMarkupId(entry.id);
      setSidePanel('marks');
      selectionDragRef.current = null;
      window.getSelection()?.removeAllRanges();
      goToPage(entry.pageNumber);
      window.setTimeout(() => showMarkupSelection(entry), 120);
      setMarksContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        entryId: entry.id,
        canDelete: true,
      });
    },
    [goToPage, showMarkupSelection],
  );

  const removeMarkup = useCallback(
    (id) => {
      if (!id) return;
      const target = markupsRef.current.find((entry) => entry.id === id);
      if (!target) return;
      if (target.source === 'pdf') {
        if (!target.pdfRect) return;
        setRemovedPdfMarkups((prev) => {
          if (prev.some((entry) => isSamePdfAnnotTarget(target, entry))) return prev;
          return [
            ...prev,
            {
              pageNumber: target.pageNumber,
              kind: target.kind,
              pdfRect: target.pdfRect,
              text: target.text,
            },
          ];
        });
      }
      setMarkups((prev) => prev.filter((entry) => entry.id !== id));
      setActiveMarkupId((prev) => (prev === id ? '' : prev));
      setSaveMessage('');
      clearAllLiveSelections();
      setSelectionMenu(null);
      setMarksContextMenu(null);
    },
    [clearAllLiveSelections],
  );

  const copyActiveMarkupText = useCallback(async () => {
    const fromMenu = selectionMenuRef.current?.text?.trim();
    const active = markupsRef.current.find((entry) => entry.id === activeMarkupIdRef.current);
    const text = fromMenu || active?.text?.trim() || '';
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const applyMarkupFromSelection = useCallback(
    (kind, color) => {
      const menu = selectionMenuRef.current;
      if (!menu || !menu.rects.length) return;
      const id = `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      /** @type {import('../../lib/pdf/pdfMarkup.js').PdfMarkupEntry} */
      const entry = {
        id,
        pageNumber: menu.pageNumber,
        kind,
        color,
        text: menu.text || `(${menu.pageNumber}페이지)`,
        source: 'saved',
        rects: menu.rects,
      };
      setMarkups((prev) => [...prev, entry]);
      setActiveMarkupId(id);
      setSidePanel('marks');
      setSaveMessage('');
      clearAllLiveSelections();
      selectionDragRef.current = null;
      window.getSelection()?.removeAllRanges();
      setSelectionMenu(null);
      window.setTimeout(() => showMarkupSelection(entry), 50);
    },
    [clearAllLiveSelections, showMarkupSelection],
  );

  const copySelectionText = useCallback(async () => {
    await copyActiveMarkupText();
    clearAllLiveSelections();
    selectionDragRef.current = null;
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  }, [clearAllLiveSelections, copyActiveMarkupText]);

  useEffect(() => {
    repaintMarkupLayers();
  }, [markups, activeMarkupId, repaintMarkupLayers]);

  // Tiny-style: line-band live selection + popup menu; markup click selects list item.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !docReady) return undefined;

    const updateLive = (pageNumber, selection) => {
      const layer = selectionLayerRefs.current.get(pageNumber);
      if (!layer) return;
      const pageWrap = scroller.querySelector(`[data-pdf-page="${pageNumber}"]`);
      const scale =
        pageWrap instanceof HTMLElement
          ? getPageDisplayScale(pageWrap, pageCssScaleRef.current || displayScaleRef.current || 1)
          : pageCssScaleRef.current || displayScaleRef.current || 1;
      if (!selection?.rects?.length) {
        clearLiveSelectionLayer(layer);
        return;
      }
      paintLiveSelectionOnLayer(layer, selection.rects, scale);
    };

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-pdf-selection-menu]')) return;
      if (target.closest('[data-pdf-marks-menu]')) return;

      closeSelectionMenu();
      closeMarksContextMenu();
      window.getSelection()?.removeAllRanges();

      const pageWrap = target.closest('[data-pdf-page]');
      if (!(pageWrap instanceof HTMLElement) || !scroller.contains(pageWrap)) return;
      if (pageWrap.dataset.pdfReady !== '1') return;

      const pageNumber = Number(pageWrap.dataset.pdfPage || '0');
      if (!pageNumber) return;

      const scale = pageCssScaleRef.current || displayScaleRef.current || 1;
      const anchor = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);

      const words = pageWordsRefs.current.get(pageNumber);
      if (!words?.length) {
        // No text metrics yet — allow markup click only.
        const hitMarkup = findMarkupAtPagePoint(markupsRef.current, pageNumber, anchor);
        if (hitMarkup) {
          event.preventDefault();
          selectMarkupEntryRef.current(hitMarkup);
        } else {
          setActiveMarkupId('');
          clearAllLiveSelections();
        }
        selectionDragRef.current = null;
        return;
      }

      // Defer markup select until click (no drag) so highlights don't block text selection.
      const pendingMarkup = findMarkupAtPagePoint(markupsRef.current, pageNumber, anchor);
      setActiveMarkupId('');
      selectionDragRef.current = {
        pageNumber,
        anchor,
        moved: false,
        selection: null,
        pendingMarkupId: pendingMarkup?.id || '',
      };
      clearAllLiveSelections();
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      const drag = selectionDragRef.current;
      if (!drag) return;
      const pageWrap = scroller.querySelector(`[data-pdf-page="${drag.pageNumber}"]`);
      if (!(pageWrap instanceof HTMLElement)) return;
      const words = pageWordsRefs.current.get(drag.pageNumber);
      if (!words?.length) return;

      const scale = pageCssScaleRef.current || displayScaleRef.current || 1;
      const cursor = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
      const dx = cursor.x - drag.anchor.x;
      const dy = cursor.y - drag.anchor.y;
      if (!drag.moved && dx * dx + dy * dy < 0.35) return;
      drag.moved = true;
      drag.pendingMarkupId = '';

      const selection = getTextBlockSelection(words, drag.anchor, cursor);
      drag.selection = selection;
      updateLive(drag.pageNumber, selection);
      event.preventDefault();
    };

    const onPointerUp = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-pdf-selection-menu]')) {
        return;
      }

      const drag = selectionDragRef.current;
      if (!drag) return;

      const pageWrap = scroller.querySelector(`[data-pdf-page="${drag.pageNumber}"]`);
      const words = pageWordsRefs.current.get(drag.pageNumber);
      const scale = pageCssScaleRef.current || displayScaleRef.current || 1;
      let selection = drag.selection;
      if (pageWrap instanceof HTMLElement && words?.length && drag.moved) {
        const cursor = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
        selection = getTextBlockSelection(words, drag.anchor, cursor);
        drag.selection = selection;
        updateLive(drag.pageNumber, selection);
      }
      const pendingMarkupId = drag.pendingMarkupId;
      const pageNumber = drag.pageNumber;
      selectionDragRef.current = null;

      if (!drag.moved && pendingMarkupId) {
        const entry = markupsRef.current.find((item) => item.id === pendingMarkupId);
        if (entry) {
          selectMarkupEntryRef.current(entry);
          return;
        }
      }

      if (selection?.text?.trim() && selection.rects.length) {
        setSelectionMenu({
          clientX: event.clientX,
          clientY: event.clientY,
          pageNumber,
          text: selection.text,
          rects: selection.rects,
        });
        return;
      }

      clearAllLiveSelections();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeSelectionMenu();
        closeMarksContextMenu();
        clearAllLiveSelections();
        selectionDragRef.current = null;
        setActiveMarkupId('');
        window.getSelection()?.removeAllRanges();
      }
    };

    scroller.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [clearAllLiveSelections, closeMarksContextMenu, closeSelectionMenu, docReady]);

  useEffect(() => {
    if (!marksContextMenu) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-pdf-marks-menu]')) return;
      closeMarksContextMenu();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [closeMarksContextMenu, marksContextMenu]);
  const handleExportMarkups = useCallback(() => {
    const entries = markupsRef.current;
    if (!entries.length) {
      setSaveMessage('내보낼 형광펜·밑줄이 없습니다.');
      window.setTimeout(() => setSaveMessage(''), 2500);
      return;
    }
    try {
      downloadPdfMarkupsXlsx(entries, fileName || 'document.pdf');
      setSaveMessage(`형광펜 ${entries.length}건을 엑셀로 내보냈습니다.`);
      window.setTimeout(() => setSaveMessage(''), 2500);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? `형광펜 내보내기 실패: ${err.message}` : '형광펜 내보내기에 실패했습니다.',
      );
    }
  }, [fileName]);

  const handlePrint = useCallback(() => {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = absoluteStreamUrl;
    document.body.appendChild(frame);
    const cleanup = () => {
      window.setTimeout(() => frame.remove(), 1000);
    };
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(absoluteStreamUrl, '_blank', 'noopener');
      }
      cleanup();
    };
    window.setTimeout(cleanup, 15000);
  }, [absoluteStreamUrl]);

  const runSearch = useCallback(
    async (rawQuery = searchQuery) => {
      const pdf = pdfRef.current;
      if (!pdf) return;

      const trimmed = String(rawQuery ?? '').trim();
      if (!trimmed) {
        clearSearch();
        return;
      }

      setSearching(true);
      setSearchMessage('');
      try {
        const nextMatches = await searchPdfDocument(pdf, trimmed);
        searchedQueryRef.current = trimmed.toLowerCase();
        setMatches(nextMatches);
        matchesRef.current = nextMatches;

        if (!nextMatches.length) {
          setActiveMatch(-1);
          activeMatchRef.current = -1;
          clearHighlights();
          setSearchMessage('검색 결과가 없습니다');
          return;
        }

        setSearchMessage('');
        showMatch(0, nextMatches);
      } catch (err) {
        searchedQueryRef.current = '';
        setMatches([]);
        matchesRef.current = [];
        setActiveMatch(-1);
        activeMatchRef.current = -1;
        clearHighlights();
        setSearchMessage(err instanceof Error ? err.message : '검색에 실패했습니다.');
      } finally {
        setSearching(false);
      }
    },
    [clearHighlights, clearSearch, searchQuery, showMatch],
  );

  const goNextMatch = useCallback(() => {
    if (!matchesRef.current.length) return;
    showMatch(activeMatchRef.current < 0 ? 0 : activeMatchRef.current + 1);
  }, [showMatch]);

  const goPrevMatch = useCallback(() => {
    if (!matchesRef.current.length) return;
    showMatch(
      activeMatchRef.current < 0
        ? matchesRef.current.length - 1
        : activeMatchRef.current - 1,
    );
  }, [showMatch]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      const trimmed = searchQuery.trim();
      if (!trimmed) {
        clearSearch();
        return;
      }

      const normalized = trimmed.toLowerCase();
      const hasResultsForQuery =
        matchesRef.current.length > 0 && searchedQueryRef.current === normalized;

      if (event.shiftKey) {
        if (hasResultsForQuery) goPrevMatch();
        else void runSearch(trimmed);
        return;
      }

      if (hasResultsForQuery) {
        goNextMatch();
        return;
      }

      void runSearch(trimmed);
    },
    [clearSearch, goNextMatch, goPrevMatch, runSearch, searchQuery],
  );

  const unsavedMarkups = useMemo(
    () => markups.filter((entry) => entry.source !== 'pdf'),
    [markups],
  );
  const canSaveToFile =
    (unsavedMarkups.length > 0 || removedPdfMarkups.length > 0) &&
    !loading &&
    !loadError &&
    !savingToFile &&
    docReady;

  const handleSaveToFile = useCallback(async () => {
    const pdf = pdfRef.current;
    const pending = markupsRef.current.filter((entry) => entry.source !== 'pdf');
    const pendingRemove = removedPdfMarkupsRef.current;
    if (!pdf || savingToFile) return;
    if (!pending.length && !pendingRemove.length) return;

    setSavingToFile(true);
    setSaveMessage('');
    skipViewerSaveRef.current = true;

    try {
      const rot = rotationRef.current;
      /** @type {Array<{ pageNumber: number, kind: 'highlight' | 'underline', color: string, text?: string, pdfRects: import('../../lib/pdf/embedPdfMarkups.js').PdfUserRect[] }>} */
      const embedEntries = [];

      for (const entry of pending) {
        const page = await pdf.getPage(entry.pageNumber);
        const pdfRects = await viewportRectsToPdfUserRects(page, entry.rects, rot);
        if (!pdfRects.length) continue;
        embedEntries.push({
          pageNumber: entry.pageNumber,
          kind: entry.kind,
          color: entry.color,
          text: entry.text,
          pdfRects,
        });
      }

      if (!embedEntries.length && !pendingRemove.length) {
        throw new Error('저장할 형광펜 변경을 만들지 못했습니다.');
      }

      const sourceBase64 = await window.nas4usb.fs.readFile(relativePath);
      const nextBytes = await embedMarkupsIntoPdfBytes(
        base64ToBytes(sourceBase64),
        embedEntries,
        pendingRemove,
      );
      await window.nas4usb.fs.writeFile(relativePath, bytesToBase64(nextBytes));

      setRemovedPdfMarkups([]);
      await writePdfViewerSidecar(relativePath, {
        view: {
          page: currentPageRef.current,
          zoomMode: zoomModeRef.current,
          customScale: customScaleRef.current,
          rotation: rotationRef.current,
          twoPageView: twoPageViewRef.current,
        },
        markups: [],
        removed: [],
      });

      setSaveMessage('원본 PDF에 저장했습니다.');
      setDocumentEpoch((prev) => prev + 1);
    } catch (err) {
      console.warn('[pdf] save to file failed:', err);
      setSaveMessage(err instanceof Error ? err.message : '원본 저장에 실패했습니다.');
      skipViewerSaveRef.current = false;
    } finally {
      setSavingToFile(false);
    }
  }, [relativePath, savingToFile]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        if (typing) return;
        event.preventDefault();
        if (canSaveToFile) void handleSaveToFile();
        return;
      }

      if (event.key === 'F3' && matchesRef.current.length) {
        event.preventDefault();
        if (event.shiftKey) goPrevMatch();
        else goNextMatch();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomBy('in');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        zoomBy('out');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        resetZoom();
        return;
      }

      if (typing) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (activeMarkupIdRef.current || selectionMenuRef.current?.text) {
          event.preventDefault();
          void copyActiveMarkupText();
          return;
        }
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const id = activeMarkupIdRef.current;
        if (id) {
          event.preventDefault();
          removeMarkup(id);
          return;
        }
      }

      if (event.key === 'PageDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(currentPage + 1);
      } else if (event.key === 'PageUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canSaveToFile,
    copyActiveMarkupText,
    currentPage,
    goNextMatch,
    goPrevMatch,
    goToPage,
    handleSaveToFile,
    removeMarkup,
    resetZoom,
    zoomBy,
  ]);

  const matchLabel =
    matches.length > 0 && activeMatch >= 0
      ? `${activeMatch + 1} / ${matches.length}`
      : searching
        ? '검색 중…'
        : searchMessage;

  const hasActiveResults =
    matches.length > 0 && searchedQueryRef.current === searchQuery.trim().toLowerCase();

  const zoomPercent = Math.round(displayScale * 100);
  const busy = loading || Boolean(loadError);

  return (
    <ViewerModal
      title={fileName}
      subtitle={`PDF · ${mimeType}${pageCount ? ` · ${pageCount}페이지` : ''}`}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
      actions={
        <AppModalButton
          onClick={() => void handleSaveToFile()}
          disabled={!canSaveToFile}
          title="형광펜·밑줄을 원본 PDF에 저장 (Ctrl+S)"
        >
          {savingToFile ? '저장 중…' : '저장'}
        </AppModalButton>
      }
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${showThumbnails ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={() => toggleSidePanel('thumbs')}
          title="썸네일 패널"
          aria-pressed={showThumbnails}
        >
          썸네일
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${showMarksPanel ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={() => toggleSidePanel('marks')}
          title="형광펜 · 밑줄 목록"
          aria-pressed={showMarksPanel}
        >
          형광펜
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
          title="이전 페이지"
        >
          ◀
        </button>
        <input
          type="text"
          inputMode="numeric"
          className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs outline-none focus:border-nas-accent"
          value={pageInput}
          disabled={busy || !pageCount}
          onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            const n = Number(pageInput);
            if (Number.isFinite(n) && n > 0) goToPage(n);
            else setPageInput(String(currentPage));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const n = Number(pageInput);
              if (Number.isFinite(n) && n > 0) goToPage(n);
              else setPageInput(String(currentPage));
            }
          }}
          aria-label="페이지 번호"
        />
        <span className="text-xs text-slate-500">/ {pageCount || '—'}</span>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || currentPage >= pageCount}
          onClick={() => goToPage(currentPage + 1)}
          title="다음 페이지"
        >
          ▶
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          보기
        </span>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || displayScale <= PDF_MIN_SCALE}
          onClick={() => zoomBy('out')}
          title="축소 (Ctrl+-)"
        >
          −
        </button>
        <button
          type="button"
          className="nas-btn-ghost min-w-[3.25rem] text-xs"
          disabled={busy}
          onClick={resetZoom}
          title="실제 크기 100% (Ctrl+0)"
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || displayScale >= PDF_MAX_SCALE}
          onClick={() => zoomBy('in')}
          title="확대 (Ctrl+=)"
        >
          +
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${zoomMode === 'fitWidth' ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={setFitWidth}
          title="너비에 맞춤"
        >
          너비
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${zoomMode === 'fitHeight' ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={setFitHeight}
          title="높이에 맞춤"
        >
          높이
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${zoomMode === 'fitPage' ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={setFitPage}
          title="페이지 맞춤"
        >
          페이지
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${twoPageView ? 'bg-slate-200' : ''}`}
          disabled={busy || pageCount < 2}
          onClick={toggleTwoPageView}
          title="두 페이지를 나란히 보기"
          aria-pressed={twoPageView}
        >
          2쪽
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy}
          onClick={rotateClockwise}
          title="시계 방향 회전"
        >
          회전
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy}
          onClick={handlePrint}
          title="인쇄"
        >
          인쇄
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || markups.length === 0}
          onClick={handleExportMarkups}
          title="형광펜·밑줄을 Excel로 내보내기"
        >
          형광펜 내보내기
        </button>
      </div>

      {saveMessage ? (
        <div
          className={`border-b px-3 py-1.5 text-xs ${
            saveMessage.includes('실패') || saveMessage.includes('못')
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {saveMessage}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <label className="sr-only" htmlFor="pdf-search-input">
          PDF 텍스트 검색
        </label>
        <input
          id="pdf-search-input"
          ref={searchInputRef}
          type="search"
          className="min-w-[180px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-nas-accent"
          placeholder="검색어 입력 후 Enter · 결과는 Enter로 다음"
          value={searchQuery}
          disabled={busy}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (!event.target.value.trim()) clearSearch();
          }}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={busy || searching || !searchQuery.trim()}
          onClick={() => void runSearch(searchQuery)}
        >
          검색
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={!hasActiveResults}
          onClick={goPrevMatch}
        >
          이전
        </button>
        <button
          type="button"
          className="nas-btn-ghost text-xs"
          disabled={!hasActiveResults}
          onClick={goNextMatch}
        >
          다음
        </button>
        <span
          className={`min-w-[7rem] text-xs ${
            searchMessage === '검색 결과가 없습니다' ? 'font-medium text-amber-700' : 'text-slate-500'
          }`}
        >
          {matchLabel}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 bg-slate-200">
        {showThumbnails && (
          <aside
            className="pdf-thumb-rail flex shrink-0 flex-col border-r border-slate-300 bg-slate-100"
            style={{ width: PDF_SIDE_RAIL_WIDTH_PX }}
            aria-label="페이지 썸네일"
          >
            <div className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600">
              썸네일
            </div>
            <div
              ref={thumbScrollRef}
              className="pdf-thumb-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2"
              onClick={(event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const item = target.closest('[data-pdf-thumb-page]');
                if (!(item instanceof HTMLElement)) return;
                const pageNumber = Number(item.dataset.pdfThumbPage || '0');
                if (pageNumber > 0) goToPage(pageNumber);
              }}
            />
          </aside>
        )}

        {showMarksPanel && (
          <aside
            className="pdf-marks-rail flex shrink-0 flex-col border-r border-slate-300 bg-slate-50"
            style={{ width: PDF_SIDE_RAIL_WIDTH_PX }}
            aria-label="형광펜 · 밑줄 목록"
          >
            <div className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600">
              형광펜 ({markups.length})
            </div>
            <div
              ref={marksListRef}
              className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  const id = activeMarkupIdRef.current;
                  if (!id) return;
                  event.preventDefault();
                  removeMarkup(id);
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                  event.preventDefault();
                  void copyActiveMarkupText();
                }
              }}
            >
              {markups.length === 0 ? (
                <p className="px-1 py-2 text-[11px] leading-relaxed text-slate-500">
                  형광펜이나 밑줄 친 내용이 없습니다. 본문에서 텍스트를 드래그한 뒤 메뉴에서
                  형광펜·밑줄을 추가한 다음 [저장]으로 원본 PDF에 기록하세요. 읽던 위치는
                  자동 보관됩니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {markups.map((entry) => {
                    const active = entry.id === activeMarkupId;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          data-markup-id={entry.id}
                          className={`pdf-mark-item w-full text-left ${active ? 'pdf-mark-item--active' : ''}`}
                          onClick={() => selectMarkupEntry(entry)}
                          onContextMenu={(event) => openMarksContextMenu(event, entry)}
                        >
                          <span
                            className="pdf-mark-swatch"
                            style={{ background: entry.color }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-slate-700">
                              {entry.text || '(표시)'}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {entry.pageNumber}쪽 ·{' '}
                              {entry.kind === 'underline' ? '밑줄' : '형광펜'}
                              {entry.source === 'pdf' ? ' · PDF' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        )}

        <div className="relative min-h-0 min-w-0 flex-1">
          {(loading || rendering) && !loadError && (
            <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-200/70 text-sm text-slate-600">
              {loading ? 'PDF 불러오는 중…' : '레이아웃 준비 중…'}
            </p>
          )}
          <div ref={scrollRef} className="pdf-scroll h-full min-h-0 overflow-auto p-3" />

          {selectionMenu &&
            createPortal(
              <div
                data-pdf-selection-menu="1"
                className="pdf-selection-menu"
                style={{
                  left: Math.min(selectionMenu.clientX, window.innerWidth - 280),
                  top: Math.min(selectionMenu.clientY + 8, window.innerHeight - 160),
                }}
                role="menu"
              >
                <div className="pdf-selection-menu__row">
                  <button
                    type="button"
                    className="pdf-selection-menu__action"
                    onClick={() => {
                      applyMarkupFromSelection(
                        'highlight',
                        pdfHighlightPresetColor(highlightColorId),
                      );
                    }}
                  >
                    <span
                      className="pdf-selection-menu__swatch"
                      style={{ background: pdfHighlightPresetColor(highlightColorId) }}
                    />
                    형광펜
                  </button>
                  <div className="pdf-selection-menu__colors" role="group" aria-label="형광펜 색상">
                    {PDF_HIGHLIGHT_PRESET_ORDER.map((presetId) => (
                      <button
                        key={`hl-${presetId}`}
                        type="button"
                        className={`pdf-color-chip ${highlightColorId === presetId ? 'pdf-color-chip--active' : ''}`}
                        style={{ background: pdfHighlightPresetColor(presetId) }}
                        title={PDF_HIGHLIGHT_PRESET_LABELS[presetId] || presetId}
                        onClick={() => {
                          setHighlightColorId(presetId);
                          applyMarkupFromSelection('highlight', pdfHighlightPresetColor(presetId));
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pdf-selection-menu__row">
                  <button
                    type="button"
                    className="pdf-selection-menu__action"
                    onClick={() => {
                      applyMarkupFromSelection(
                        'underline',
                        pdfUnderlinePresetColor(underlineColorId),
                      );
                    }}
                  >
                    <span
                      className="pdf-selection-menu__swatch pdf-selection-menu__swatch--underline"
                      style={{ borderBottomColor: pdfUnderlinePresetColor(underlineColorId) }}
                    />
                    밑줄
                  </button>
                  <div className="pdf-selection-menu__colors" role="group" aria-label="밑줄 색상">
                    {PDF_UNDERLINE_PRESET_ORDER.map((presetId) => (
                      <button
                        key={`ul-${presetId}`}
                        type="button"
                        className={`pdf-color-chip ${underlineColorId === presetId ? 'pdf-color-chip--active' : ''}`}
                        style={{ background: pdfUnderlinePresetColor(presetId) }}
                        title={PDF_UNDERLINE_PRESET_LABELS[presetId] || presetId}
                        onClick={() => {
                          setUnderlineColorId(presetId);
                          applyMarkupFromSelection('underline', pdfUnderlinePresetColor(presetId));
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="pdf-selection-menu__action pdf-selection-menu__action--full"
                  onClick={() => void copySelectionText()}
                >
                  복사
                </button>
              </div>,
              document.body,
            )}

          {marksContextMenu &&
            createPortal(
              <div
                data-pdf-marks-menu="1"
                className="pdf-selection-menu pdf-marks-context-menu"
                style={{
                  left: Math.min(marksContextMenu.clientX, window.innerWidth - 180),
                  top: Math.min(marksContextMenu.clientY + 4, window.innerHeight - 100),
                }}
                role="menu"
              >
                <button
                  type="button"
                  className="pdf-selection-menu__action pdf-selection-menu__action--full"
                  role="menuitem"
                  onClick={() => {
                    void copyActiveMarkupText();
                    closeMarksContextMenu();
                  }}
                >
                  복사
                </button>
                <button
                  type="button"
                  className="pdf-selection-menu__action pdf-selection-menu__action--full pdf-marks-context-menu__danger"
                  role="menuitem"
                  disabled={!marksContextMenu.canDelete}
                  title={
                    marksContextMenu.canDelete
                      ? '이 형광펜을 삭제합니다. 원본 PDF 표시는 [저장] 후 파일에서도 제거됩니다.'
                      : '삭제할 수 없습니다'
                  }
                  onClick={() => {
                    if (!marksContextMenu.canDelete) return;
                    removeMarkup(marksContextMenu.entryId);
                  }}
                >
                  삭제
                </button>
              </div>,
              document.body,
            )}
        </div>
      </div>

      <style>{`
        .pdf-scroll { scrollbar-gutter: stable; }
        .pdf-spread-row {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 12px;
          width: fit-content;
          max-width: 100%;
          margin: 0 auto 12px;
        }
        .pdf-page-wrap {
          position: relative;
          width: fit-content;
          max-width: 100%;
          margin: 0 auto 12px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
          background: #fff;
          cursor: text;
          box-sizing: border-box;
        }
        .pdf-page-wrap[data-pdf-ready="0"] {
          background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
          cursor: default;
        }
        .pdf-page-wrap[data-pdf-ready="0"] .pdf-page-canvas {
          opacity: 0;
        }
        .pdf-scroll--two-up .pdf-page-wrap {
          margin: 0;
        }
        .pdf-page-canvas {
          display: block;
          width: 100% !important;
          height: auto !important;
          max-width: none;
        }
        .pdf-highlight-layer,
        .pdf-selection-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
        }
        .pdf-selection-layer {
          z-index: 2;
        }
        .pdf-hit-layer {
          position: absolute;
          inset: 0;
          z-index: 4;
          cursor: text;
          touch-action: none;
          background: transparent;
        }
        .pdf-live-selection {
          position: absolute;
          background: rgba(51, 153, 255, 0.35);
          border-radius: 1px;
        }
        .pdf-search-hit {
          position: absolute;
          background: rgba(250, 204, 21, 0.35);
          border-radius: 2px;
        }
        .pdf-search-hit--active {
          background: rgba(249, 115, 22, 0.45);
          outline: 1px solid rgba(234, 88, 12, 0.8);
        }
        .pdf-markup {
          position: absolute;
          pointer-events: none;
          box-sizing: border-box;
        }
        .pdf-markup--highlight {
          opacity: 0.45;
          mix-blend-mode: multiply;
          border-radius: 1px;
        }
        .pdf-markup--underline {
          background: transparent;
          border-bottom: 2px solid;
          opacity: 0.95;
        }
        .pdf-markup--active {
          outline: 1px solid rgba(51, 153, 255, 0.95);
          outline-offset: 1px;
        }
        .pdf-text-layer,
        .textLayer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          opacity: 1;
          line-height: 1;
          z-index: 3;
          transform-origin: 0 0;
          pointer-events: none;
          user-select: none;
          -webkit-user-select: none;
        }
        .textLayer span,
        .textLayer br {
          color: transparent;
          position: absolute;
          white-space: pre;
          transform-origin: 0% 0%;
          user-select: none;
          -webkit-user-select: none;
        }
        .textLayer span::selection {
          background: transparent;
        }
        .pdf-selection-menu {
          position: fixed;
          z-index: 11050;
          min-width: 240px;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
          color: #333;
        }
        .pdf-selection-menu__row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 0;
        }
        .pdf-selection-menu__action {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 88px;
          padding: 6px 10px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: #333;
          font-size: 12px;
          text-align: left;
          cursor: pointer;
        }
        .pdf-selection-menu__action:hover {
          background: #ebebeb;
        }
        .pdf-selection-menu__action--full {
          width: 100%;
          margin-top: 2px;
        }
        .pdf-marks-context-menu {
          min-width: 140px;
          padding: 4px;
        }
        .pdf-marks-context-menu .pdf-selection-menu__action--full {
          margin-top: 0;
        }
        .pdf-marks-context-menu__danger:not(:disabled) {
          color: #b91c1c;
        }
        .pdf-marks-context-menu__danger:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .pdf-selection-menu__swatch {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 1px solid #aaa;
          flex-shrink: 0;
        }
        .pdf-selection-menu__swatch--underline {
          background: transparent;
          border: none;
          border-bottom: 3px solid;
          border-radius: 0;
          height: 8px;
        }
        .pdf-selection-menu__colors {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .pdf-color-chip {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.25);
          padding: 0;
          cursor: pointer;
        }
        .pdf-color-chip--active {
          outline: 2px solid #0ea5e9;
          outline-offset: 1px;
        }
        .pdf-mark-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: #fff;
        }
        .pdf-mark-item:hover { background: #f1f5f9; }
        .pdf-mark-item--active {
          border-color: #0ea5e9;
          background: rgba(14, 165, 233, 0.1);
        }
        .pdf-mark-swatch {
          width: 10px;
          height: 10px;
          margin-top: 3px;
          border-radius: 2px;
          flex-shrink: 0;
          border: 1px solid rgba(15, 23, 42, 0.15);
        }
        .pdf-thumb-scroll { scrollbar-gutter: stable; }
        .pdf-thumb-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 100%;
          margin: 0 0 10px;
          padding: 6px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
        }
        .pdf-thumb-item:hover { background: rgba(148, 163, 184, 0.25); }
        .pdf-thumb-item--active {
          border-color: #0ea5e9;
          background: rgba(14, 165, 233, 0.12);
        }
        .pdf-thumb-canvas {
          display: none;
          max-width: 100%;
          height: auto;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
          background: #fff;
        }
        .pdf-thumb-placeholder {
          display: block;
          max-width: 100%;
          border-radius: 2px;
          background: linear-gradient(180deg, #e2e8f0 0%, #f1f5f9 100%);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        }
        .pdf-thumb-item[data-pdf-thumb-ready="1"] .pdf-thumb-placeholder {
          display: none !important;
        }
        .pdf-thumb-item[data-pdf-thumb-ready="1"] .pdf-thumb-canvas {
          display: block;
        }
        .pdf-thumb-label {
          font-size: 11px;
          line-height: 1;
          color: #475569;
        }
        .pdf-thumb-item--active .pdf-thumb-label {
          color: #0369a1;
          font-weight: 600;
        }
      `}</style>
    </ViewerModal>
  );
}
