import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ViewerModal from './ViewerModal.jsx';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';
import { IconSave } from './EditorModalIcons.jsx';
import { usePlaintextObjectUrl } from '../../hooks/usePlaintextObjectUrl.js';
import { getPdfMimeType } from '../../lib/media/mediaTypes.js';
import {
  PDF_MAX_SCALE,
  PDF_MIN_SCALE,
  PasswordResponses,
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
  getTextBlockSelectionByIndices,
  hitTestSelectionHandle,
  loadPdfMarkupAnnotations,
  mountPdfTextLayer,
  paintLiveSelectionOnLayer,
  paintMarkupOnLayer,
  paintSelectionHandles,
  pdfHighlightPresetColor,
  pdfUnderlinePresetColor,
  pointInSelectionRects,
  selectionHandlePoints,
  wordIndexAtPoint,
} from '../../lib/pdf/pdfMarkup.js';
import { loadPdfViewerSidecar, writePdfViewerSidecar } from '../../lib/pdf/pdfViewerSidecar.js';
import { downloadPdfMarkupsXlsx } from '../../lib/pdf/exportPdfMarkupsXlsx.js';
import {
  IconPdfChevronLeft,
  IconPdfChevronRight,
  IconPdfExportExcel,
  IconPdfFitHeight,
  IconPdfFitPage,
  IconPdfFitWidth,
  IconPdfHighlight,
  IconPdfPrint,
  IconPdfRotate,
  IconPdfSearch,
  IconPdfSearchClose,
  IconPdfThumbs,
  IconPdfTwoPages,
  IconPdfZoomIn,
  IconPdfZoomOut,
} from './pdf/PdfToolbarIcons.jsx';
import {
  isSamePdfAnnotTarget,
  viewportRectsToPdfUserRects,
} from '../../lib/pdf/embedPdfMarkups.js';
import { detectTouchUi, useTouchUi } from '../../hooks/useTouchUi.js';

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
 *   highlightQuery?: string,
 * }} props
 */
/**
 * Onyx/Android page-turn hardware keys are often remapped to volume.
 * Chrome may deliver them as Volume* names or Android keyCodes 24/25.
 * A web page cannot stop the system volume change — only consume the event for paging.
 * @param {KeyboardEvent} event
 * @returns {'up' | 'down' | null}
 */
function physicalPageKeyDirection(event) {
  const key = String(event.key || '');
  const code = String(event.code || '');
  const keyCode = Number(event.keyCode || event.which || 0);
  if (
    key === 'AudioVolumeDown' ||
    key === 'VolumeDown' ||
    code === 'AudioVolumeDown' ||
    code === 'VolumeDown' ||
    keyCode === 25 ||
    keyCode === 174
  ) {
    return 'down';
  }
  if (
    key === 'AudioVolumeUp' ||
    key === 'VolumeUp' ||
    code === 'AudioVolumeUp' ||
    code === 'VolumeUp' ||
    keyCode === 24 ||
    keyCode === 175
  ) {
    return 'up';
  }
  return null;
}

/**
 * Fold newly scanned PDF annotations into the live list without dropping
 * sidecar / this-session marks (tablet scans are slow and used to replace state).
 * @param {import('../../lib/pdf/pdfMarkup.js').PdfMarkupEntry[]} prev
 * @param {import('../../lib/pdf/pdfMarkup.js').PdfMarkupEntry[]} incoming
 * @param {import('../../lib/pdf/embedPdfMarkups.js').PdfRemovedAnnot[]} removed
 */
function mergeLoadedPdfMarkups(prev, incoming, removed) {
  const visible = incoming.filter(
    (entry) => !removed.some((target) => isSamePdfAnnotTarget(entry, target)),
  );
  if (!visible.length) return prev;

  const byId = new Map(prev.map((entry) => [entry.id, entry]));
  for (const entry of visible) {
    const existing = byId.get(entry.id);
    if (existing && existing.source !== 'pdf') continue;
    const existingLooksPlaceholder = existing && /^\(\d+페이지\)$/.test(String(existing.text || '').trim());
    const incomingLooksPlaceholder = /^\(\d+페이지\)$/.test(String(entry.text || '').trim());
    if (existing && !existingLooksPlaceholder && incomingLooksPlaceholder) continue;
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export default function PdfViewerShell({
  relativePath,
  fileName,
  extension = 'pdf',
  onClose,
  allowClose = true,
  fullscreen = false,
  raised = false,
  highlightQuery = '',
}) {
  const mimeType = getPdfMimeType(extension);
  const [documentEpoch, setDocumentEpoch] = useState(0);
  const [savingToFile, setSavingToFile] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const streamUrl = usePlaintextObjectUrl(relativePath, mimeType, documentEpoch);
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const passwordInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const passwordWaitRef = useRef(
    /** @type {{ resolve: (value: string | null) => void } | null} */ (null),
  );
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoomMode, setZoomMode] = useState(/** @type {PdfZoomMode} */ ('fitWidth'));
  const [customScale, setCustomScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [twoPageView, setTwoPageView] = useState(false);
  const [docReady, setDocReady] = useState(false);
  const touchUi = useTouchUi();
  const [sidePanel, setSidePanel] = useState(
    /** @type {PdfSidePanel} */ (() => (detectTouchUi() ? null : 'thumbs')),
  );
  const [highlightColorId, setHighlightColorId] = useState('yellow');
  const [underlineColorId, setUnderlineColorId] = useState('red');
  const [markups, setMarkups] = useState(
    /** @type {import('../../lib/pdf/pdfMarkup.js').PdfMarkupEntry[]} */ ([]),
  );
  const [markupScanPending, setMarkupScanPending] = useState(false);
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
     *   start: { x: number, y: number },
     *   end: { x: number, y: number },
     *   showHandles?: boolean,
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
     *   pointerId?: number,
     *   pointerType?: string,
     *   touchPhase?: 'pending' | 'selecting' | 'handle',
     *   handleRole?: 'start' | 'end',
     *   startClientX?: number,
     *   startClientY?: number,
     * } | null} */ (null),
  );
  const lastTapRef = useRef(
    /** @type {{ time: number, pageNumber: number, x: number, y: number } | null} */ (null),
  );
  /** Skip autosave until initial sidecar restore finishes. */
  const skipViewerSaveRef = useRef(true);
  /** Sidecar already holds the full markup list — skip PDF annotation scan. */
  const marksCompleteRef = useRef(false);
  const persistViewerStateRef = useRef(
    /** @type {(options?: { force?: boolean }) => Promise<void>} */ (async () => {}),
  );
  /** Page to restore after first layout (from sidecar). */
  const pendingRestorePageRef = useRef(/** @type {number | null} */ (null));
  const viewerSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const zoomModeRef = useRef(zoomMode);
  const customScaleRef = useRef(customScale);
  const twoPageViewRef = useRef(twoPageView);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
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
  const sortedMarkups = useMemo(
    () =>
      [...markups].sort((a, b) => {
        const pageDelta = (a.pageNumber || 0) - (b.pageNumber || 0);
        if (pageDelta !== 0) return pageDelta;
        const aRect = a.rects?.[0];
        const bRect = b.rects?.[0];
        const topDelta = (aRect?.top ?? 0) - (bRect?.top ?? 0);
        if (topDelta !== 0) return topDelta;
        return (aRect?.left ?? 0) - (bRect?.left ?? 0);
      }),
    [markups],
  );

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
    if (!streamUrl) {
      setLoading(true);
      return undefined;
    }

    let cancelled = false;
    /** @type {import('pdfjs-dist').PDFDocumentProxy | null} */
    let pdf = null;

    const closePasswordPrompt = (result) => {
      const wait = passwordWaitRef.current;
      passwordWaitRef.current = null;
      setPasswordOpen(false);
      setPasswordBusy(false);
      setPasswordValue('');
      setPasswordHint('');
      wait?.resolve(result);
    };

    /**
     * @param {number} reason
     * @returns {Promise<string | null>}
     */
    const askPassword = (reason) => {
      if (cancelled) return Promise.resolve(null);
      // Drop a stale waiter (should not happen, but keeps UI consistent).
      if (passwordWaitRef.current) {
        passwordWaitRef.current.resolve(null);
        passwordWaitRef.current = null;
      }
      setPasswordValue('');
      setPasswordBusy(false);
      setPasswordHint(
        reason === PasswordResponses.INCORRECT_PASSWORD
          ? '암호가 올바르지 않습니다. 다시 입력해 주세요.'
          : '이 PDF는 암호로 보호되어 있습니다.',
      );
      setPasswordOpen(true);
      return new Promise((resolve) => {
        passwordWaitRef.current = { resolve };
      });
    };

    async function load() {
      setLoading(true);
      setLoadError(null);
      setPageCount(0);
      setCurrentPage(1);
      setPageInput('1');
      setDocReady(false);
      clearSearch();
      setMarkups([]);
      setMarkupScanPending(false);
      marksCompleteRef.current = false;
      setRemovedPdfMarkups([]);
      setActiveMarkupId('');
      pdfRef.current = null;
      skipViewerSaveRef.current = true;
      pendingRestorePageRef.current = null;
      closePasswordPrompt(null);

      try {
        const [loadedPdf, sidecar] = await Promise.all([
          loadPdfDocument(streamUrl, { onPasswordNeed: askPassword }),
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
        removedPdfMarkupsRef.current = removed;
        setRemovedPdfMarkups(removed);
        setMarkups([...savedMarkups]);
        const skipMarkupScan = sidecar?.marksComplete === true || savedMarkups.length > 0;
        marksCompleteRef.current = skipMarkupScan;
        setMarkupScanPending(!skipMarkupScan);

        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setDocReady(true);
        setLoading(false);

        if (skipMarkupScan) return;

        void loadPdfMarkupAnnotations(pdf, {
          onPage: (pageEntries) => {
            if (cancelled) return;
            setMarkups((prev) =>
              mergeLoadedPdfMarkups(prev, pageEntries, removedPdfMarkupsRef.current),
            );
          },
        })
          .then((embedded) => {
            if (cancelled) return;
            setMarkups((prev) => {
              const next = mergeLoadedPdfMarkups(prev, embedded, removedPdfMarkupsRef.current);
              markupsRef.current = next;
              return next;
            });
            marksCompleteRef.current = true;
            setMarkupScanPending(false);
            void persistViewerStateRef.current({ force: true });
          })
          .catch((err) => {
            console.warn('[pdf] markup load failed:', err);
            if (cancelled) return;
            marksCompleteRef.current = true;
            setMarkupScanPending(false);
            void persistViewerStateRef.current({ force: true });
          });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err ?? '');
          const cancelledPassword = /PasswordCancelled/i.test(message);
          setLoadError(
            cancelledPassword
              ? '암호 입력이 취소되어 PDF를 열 수 없습니다.'
              : message || 'PDF를 표시할 수 없습니다.',
          );
          setLoading(false);
          skipViewerSaveRef.current = false;
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      closePasswordPrompt(null);
      renderTokenRef.current += 1;
      cancelPageRenders();
      teardownThumbnails();
      pdfRef.current = null;
      void destroyPdfDocument(pdf);
    };
  }, [cancelPageRenders, clearSearch, relativePath, streamUrl, teardownThumbnails]);

  useEffect(() => {
    if (!passwordOpen) return undefined;
    const timer = window.setTimeout(() => passwordInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [passwordOpen]);

  const submitPdfPassword = useCallback(() => {
    const wait = passwordWaitRef.current;
    if (!wait || passwordBusy) return;
    const value = passwordValue;
    if (!value) {
      setPasswordHint('암호를 입력해 주세요.');
      passwordInputRef.current?.focus();
      return;
    }
    setPasswordBusy(true);
    passwordWaitRef.current = null;
    setPasswordOpen(false);
    wait.resolve(value);
  }, [passwordBusy, passwordValue]);

  const cancelPdfPassword = useCallback(() => {
    const wait = passwordWaitRef.current;
    passwordWaitRef.current = null;
    setPasswordOpen(false);
    setPasswordBusy(false);
    setPasswordValue('');
    setPasswordHint('');
    wait?.resolve(null);
  }, []);

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

  const persistViewerState = useCallback(async (options = {}) => {
    if ((!options.force && skipViewerSaveRef.current) || !relativePath) return;
    try {
      await writePdfViewerSidecar(relativePath, {
        view: {
          page: currentPageRef.current,
          zoomMode: zoomModeRef.current,
          customScale: customScaleRef.current,
          rotation: rotationRef.current,
          twoPageView: twoPageViewRef.current,
        },
        markups: markupsRef.current,
        removed: removedPdfMarkupsRef.current,
        marksComplete: marksCompleteRef.current,
      });
    } catch (err) {
      console.warn('[pdf] viewer state save failed:', err);
    }
  }, [relativePath]);
  persistViewerStateRef.current = persistViewerState;

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

  const [scrollEdges, setScrollEdges] = useState({ atTop: true, atBottom: true });

  const updateScrollEdges = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      setScrollEdges({ atTop: true, atBottom: true });
      return;
    }
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const top = scroller.scrollTop;
    setScrollEdges({
      atTop: top <= 2,
      atBottom: top >= maxTop - 2,
    });
  }, []);

  // Track current page from scroll.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !pageCount) return undefined;

    const onScroll = () => {
      updateScrollEdges();
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

    updateScrollEdges();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [pageCount, rendering, twoPageView, updateScrollEdges]);

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
        updateScrollEdges();
      }, 400);
    },
    [pageCount, updateScrollEdges],
  );

  /** Fit-width: nudge viewport; fit-height/page: jump pages. */
  const handleFabNavigate = useCallback(
    (direction) => {
      if (zoomModeRef.current === 'fitWidth') {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const step = Math.max(140, Math.round(scroller.clientHeight * 0.45));
        scroller.scrollBy({
          top: direction === 'up' ? -step : step,
          behavior: 'smooth',
        });
        window.setTimeout(() => updateScrollEdges(), 320);
        return;
      }
      goToPage(currentPageRef.current + (direction === 'up' ? -1 : 1));
    },
    [goToPage, updateScrollEdges],
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
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.querySelectorAll('[data-pdf-hit="1"]').forEach((hit) => {
      if (!(hit instanceof HTMLElement)) return;
      hit.querySelectorAll('[data-pdf-sel-handle]').forEach((node) => node.remove());
      hit.style.touchAction = 'pan-x pan-y';
    });
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

  const openMarksContextMenuRef = useRef(openMarksContextMenu);
  openMarksContextMenuRef.current = openMarksContextMenu;

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
      if (!touchUi) setSidePanel('marks');
      setSaveMessage('');
      clearAllLiveSelections();
      selectionDragRef.current = null;
      window.getSelection()?.removeAllRanges();
      setSelectionMenu(null);
      window.setTimeout(() => showMarkupSelection(entry), 50);
    },
    [clearAllLiveSelections, showMarkupSelection, touchUi],
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

  // Mouse/pen: drag selects. Touch: pan scrolls; double-tap selects a word; handles extend range.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !docReady) return undefined;

    const TOUCH_SCROLL_SLOP_PX = 12;
    const DOUBLE_TAP_MS = 420;
    const DOUBLE_TAP_SLOP_PX = 40;

    const clearSelectionDrag = () => {
      selectionDragRef.current = null;
    };

    const pageScale = (pageNumber) => {
      const pageWrap = scroller.querySelector(`[data-pdf-page="${pageNumber}"]`);
      return pageWrap instanceof HTMLElement
        ? getPageDisplayScale(pageWrap, pageCssScaleRef.current || displayScaleRef.current || 1)
        : pageCssScaleRef.current || displayScaleRef.current || 1;
    };

    const hitLayerForPage = (pageNumber) => {
      const pageWrap = scroller.querySelector(`[data-pdf-page="${pageNumber}"]`);
      const hit = pageWrap?.querySelector('[data-pdf-hit="1"]');
      return hit instanceof HTMLElement ? hit : null;
    };

    const updateLive = (pageNumber, selection, showHandles = false) => {
      const layer = selectionLayerRefs.current.get(pageNumber);
      const scale = pageScale(pageNumber);
      const rects = selection?.rects || [];
      if (layer) {
        if (!rects.length) clearLiveSelectionLayer(layer);
        else paintLiveSelectionOnLayer(layer, rects, scale);
      }
      const hit = hitLayerForPage(pageNumber);
      if (hit) {
        paintSelectionHandles(hit, showHandles ? rects : [], scale);
        hit.style.touchAction = showHandles && rects.length ? 'none' : 'pan-x pan-y';
      }
    };

    const menuAnchorFromRects = (pageNumber, rects) => {
      const pageWrap = scroller.querySelector(`[data-pdf-page="${pageNumber}"]`);
      if (!(pageWrap instanceof HTMLElement) || !rects?.length) {
        return { clientX: window.innerWidth / 2, clientY: 120 };
      }
      const scale = pageScale(pageNumber);
      const box = pageWrap.getBoundingClientRect();
      const first = rects[0];
      const last = rects[rects.length - 1];
      const left = Math.min(first.left, last.left);
      const right = Math.max(first.left + first.width, last.left + last.width);
      const clientX = box.left + ((left + right) / 2) * scale;
      const clientY = box.top + first.top * scale;
      return {
        clientX: Math.min(Math.max(16, clientX), window.innerWidth - 16),
        clientY: Math.min(Math.max(16, clientY), window.innerHeight - 16),
      };
    };

    const openSelectionFromRange = (pageNumber, selection, start, end) => {
      if (!selection?.text?.trim() || !selection.rects.length) return;
      const handles = selectionHandlePoints(selection.rects);
      const anchor = menuAnchorFromRects(pageNumber, selection.rects);
      updateLive(pageNumber, selection, true);
      setSelectionMenu({
        clientX: anchor.clientX,
        clientY: anchor.clientY,
        pageNumber,
        text: selection.text,
        rects: selection.rects,
        start: handles ? { ...handles.start } : { ...start },
        end: handles ? { ...handles.end } : { ...end },
        showHandles: true,
      });
    };

    const capturePointer = (target, pointerId) => {
      try {
        if (target instanceof Element && typeof target.setPointerCapture === 'function') {
          target.setPointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
    };

    const beginHandleDrag = (event, pageNumber, handleRole, menu) => {
      event.preventDefault();
      event.stopPropagation();
      closeMarksContextMenu();
      window.getSelection()?.removeAllRanges();
      const first = menu.rects[0];
      const last = menu.rects[menu.rects.length - 1];
      const fixed =
        handleRole === 'start'
          ? { x: last.left + last.width, y: last.top + last.height / 2 }
          : { x: first.left, y: first.top + first.height / 2 };
      const hit = hitLayerForPage(pageNumber);
      if (hit) hit.style.touchAction = 'none';
      selectionDragRef.current = {
        pageNumber,
        anchor: fixed,
        moved: true,
        selection: {
          text: menu.text,
          words: [],
          rects: menu.rects,
        },
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'mouse',
        touchPhase: 'handle',
        handleRole,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      capturePointer(event.target instanceof Element ? event.target : hit, event.pointerId);
    };

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-pdf-selection-menu]')) return;
      if (target.closest('[data-pdf-marks-menu]')) return;
      const pageWrap = target.closest('[data-pdf-page]');
      if (!(pageWrap instanceof HTMLElement) || !scroller.contains(pageWrap)) return;
      if (pageWrap.dataset.pdfReady !== '1') return;

      const pageNumber = Number(pageWrap.dataset.pdfPage || '0');
      if (!pageNumber) return;

      const scale = pageScale(pageNumber);
      const point = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
      const isTouch = event.pointerType === 'touch';
      const menu = selectionMenuRef.current;

      // Drag selection handles while a text selection is active.
      if (menu?.showHandles && menu.pageNumber === pageNumber && menu.rects?.length) {
        const fromDom = target.closest('[data-pdf-sel-handle]');
        const domRole = fromDom?.getAttribute('data-pdf-sel-handle');
        const handleHitRadius = (isTouch ? 36 : 16) / Math.max(0.35, scale);
        const handleRole =
          domRole === 'start' || domRole === 'end'
            ? domRole
            : hitTestSelectionHandle(point, menu.rects, handleHitRadius);
        if (handleRole === 'start' || handleRole === 'end') {
          beginHandleDrag(event, pageNumber, handleRole, menu);
          return;
        }

        // Inside current selection: keep handles/menu (tablet Chrome often misses the knob).
        if (pointInSelectionRects(point, menu.rects, 10 / Math.max(0.35, scale))) {
          event.preventDefault();
          return;
        }
      }

      closeSelectionMenu();
      closeMarksContextMenu();
      window.getSelection()?.removeAllRanges();
      clearAllLiveSelections();

      const words = pageWordsRefs.current.get(pageNumber);
      if (!words?.length) {
        const hitMarkup = findMarkupAtPagePoint(markupsRef.current, pageNumber, point);
        if (hitMarkup) {
          event.preventDefault();
          selectMarkupEntryRef.current(hitMarkup);
        } else {
          setActiveMarkupId('');
        }
        clearSelectionDrag();
        return;
      }

      const pendingMarkup = findMarkupAtPagePoint(markupsRef.current, pageNumber, point);
      setActiveMarkupId('');

      /** @type {NonNullable<typeof selectionDragRef.current>} */
      const drag = {
        pageNumber,
        anchor: point,
        moved: false,
        selection: null,
        pendingMarkupId: pendingMarkup?.id || '',
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'mouse',
        startClientX: event.clientX,
        startClientY: event.clientY,
      };

      if (isTouch) {
        drag.touchPhase = 'pending';
        selectionDragRef.current = drag;
        return;
      }

      selectionDragRef.current = drag;
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      const drag = selectionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.touchPhase === 'pending') {
        const dx = event.clientX - (drag.startClientX || 0);
        const dy = event.clientY - (drag.startClientY || 0);
        if (dx * dx + dy * dy >= TOUCH_SCROLL_SLOP_PX * TOUCH_SCROLL_SLOP_PX) {
          clearSelectionDrag();
          lastTapRef.current = null;
        }
        return;
      }

      const pageWrap = scroller.querySelector(`[data-pdf-page="${drag.pageNumber}"]`);
      if (!(pageWrap instanceof HTMLElement)) return;
      const words = pageWordsRefs.current.get(drag.pageNumber);
      if (!words?.length) return;

      const scale = pageScale(drag.pageNumber);
      const cursor = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);

      if (drag.touchPhase === 'handle') {
        event.preventDefault();
        const fixed = drag.anchor;
        const selection = getTextBlockSelection(words, fixed, cursor);
        if (!selection) return;
        drag.selection = selection;
        const start = drag.handleRole === 'start' ? cursor : fixed;
        const end = drag.handleRole === 'start' ? fixed : cursor;
        const anchor = menuAnchorFromRects(drag.pageNumber, selection.rects);
        updateLive(drag.pageNumber, selection, true);
        setSelectionMenu({
          clientX: anchor.clientX,
          clientY: anchor.clientY,
          pageNumber: drag.pageNumber,
          text: selection.text,
          rects: selection.rects,
          start: { ...start },
          end: { ...end },
          showHandles: true,
        });
        return;
      }

      const dx = cursor.x - drag.anchor.x;
      const dy = cursor.y - drag.anchor.y;
      if (!drag.moved && dx * dx + dy * dy < 0.35) return;
      drag.moved = true;
      drag.pendingMarkupId = '';

      const selection = getTextBlockSelection(words, drag.anchor, cursor);
      drag.selection = selection;
      updateLive(drag.pageNumber, selection, false);
      event.preventDefault();
    };

    const finishPointer = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-pdf-selection-menu]')) {
        return;
      }

      const drag = selectionDragRef.current;
      if (!drag || (drag.pointerId != null && drag.pointerId !== event.pointerId)) return;

      const wasTouchPending = drag.touchPhase === 'pending';
      const wasHandle = drag.touchPhase === 'handle';
      const pageWrap = scroller.querySelector(`[data-pdf-page="${drag.pageNumber}"]`);
      const words = pageWordsRefs.current.get(drag.pageNumber);
      const scale = pageScale(drag.pageNumber);
      let selection = drag.selection;

      if (pageWrap instanceof HTMLElement && words?.length && (drag.moved || wasHandle)) {
        const cursor = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
        if (wasHandle) {
          selection = getTextBlockSelection(words, drag.anchor, cursor) || selection;
          const start = drag.handleRole === 'start' ? cursor : drag.anchor;
          const end = drag.handleRole === 'start' ? drag.anchor : cursor;
          clearSelectionDrag();
          if (selection?.text?.trim() && selection.rects.length) {
            openSelectionFromRange(drag.pageNumber, selection, start, end);
          }
          return;
        }
        if (drag.moved && drag.touchPhase !== 'pending') {
          selection = getTextBlockSelection(words, drag.anchor, cursor);
        }
      }

      const pendingMarkupId = drag.pendingMarkupId;
      const pageNumber = drag.pageNumber;
      const moved = drag.moved;
      const anchor = drag.anchor;
      clearSelectionDrag();

      if (wasTouchPending) {
        const now = Date.now();
        const last = lastTapRef.current;
        const dx = last ? event.clientX - last.x : 0;
        const dy = last ? event.clientY - last.y : 0;
        const isDouble =
          Boolean(last) &&
          last.pageNumber === pageNumber &&
          now - last.time <= DOUBLE_TAP_MS &&
          dx * dx + dy * dy <= DOUBLE_TAP_SLOP_PX * DOUBLE_TAP_SLOP_PX;

        if (isDouble && words?.length && pageWrap instanceof HTMLElement) {
          event.preventDefault();
          lastTapRef.current = null;
          const point = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
          const wordIdx = wordIndexAtPoint(words, point);
          const picked = getTextBlockSelectionByIndices(words, wordIdx, wordIdx);
          if (picked?.text?.trim()) {
            const word = words[wordIdx];
            const start = { x: word.x0, y: (word.y0 + word.y1) / 2 };
            const end = { x: word.x1, y: (word.y0 + word.y1) / 2 };
            try {
              navigator.vibrate?.(10);
            } catch {
              // ignore
            }
            openSelectionFromRange(pageNumber, picked, start, end);
            return;
          }
        }

        lastTapRef.current = {
          time: now,
          pageNumber,
          x: event.clientX,
          y: event.clientY,
        };

        if (pendingMarkupId) {
          const entry = markupsRef.current.find((item) => item.id === pendingMarkupId);
          if (entry) {
            selectMarkupEntryRef.current(entry);
            return;
          }
        }
        clearAllLiveSelections();
        return;
      }

      if (!moved && pendingMarkupId) {
        const entry = markupsRef.current.find((item) => item.id === pendingMarkupId);
        if (entry) {
          selectMarkupEntryRef.current(entry);
          return;
        }
      }

      if (selection?.text?.trim() && selection.rects.length) {
        const endPoint =
          pageWrap instanceof HTMLElement
            ? clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale)
            : anchor;
        openSelectionFromRange(pageNumber, selection, anchor, endPoint);
        return;
      }

      clearAllLiveSelections();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeSelectionMenu();
        closeMarksContextMenu();
        clearAllLiveSelections();
        clearSelectionDrag();
        lastTapRef.current = null;
        setActiveMarkupId('');
        window.getSelection()?.removeAllRanges();
      }
    };

    const onContextMenu = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-pdf-selection-menu]')) return;
      if (target.closest('[data-pdf-marks-menu]')) return;

      const pageWrap = target.closest('[data-pdf-page]');
      if (!(pageWrap instanceof HTMLElement) || !scroller.contains(pageWrap)) return;
      if (pageWrap.dataset.pdfReady !== '1') return;

      const pageNumber = Number(pageWrap.dataset.pdfPage || '0');
      if (!pageNumber) return;

      const scale = pageScale(pageNumber);
      const point = clientPointToPagePoint(pageWrap, event.clientX, event.clientY, scale);
      const hitMarkup = findMarkupAtPagePoint(markupsRef.current, pageNumber, point);
      if (!hitMarkup) return;

      clearSelectionDrag();
      openMarksContextMenuRef.current(event, hitMarkup);
    };

    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointer);
    window.addEventListener('pointercancel', finishPointer);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearSelectionDrag();
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', finishPointer);
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
      /** @type {Array<{ id: string, pageNumber: number, kind: 'highlight' | 'underline', color: string, text?: string, pdfRects: import('../../lib/pdf/embedPdfMarkups.js').PdfUserRect[] }>} */
      const embedEntries = [];

      for (const entry of pending) {
        const page = await pdf.getPage(entry.pageNumber);
        const pdfRects = await viewportRectsToPdfUserRects(page, entry.rects, rot);
        if (!pdfRects.length) continue;
        embedEntries.push({
          id: entry.id,
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

      const embedBridge = window.nas4usb?.pdf?.embedMarkups;
      if (typeof embedBridge !== 'function') {
        throw new Error('이 환경에서는 PDF 원본 저장을 지원하지 않습니다.');
      }
      await embedBridge({
        path: relativePath,
        markups: embedEntries,
        remove: pendingRemove,
      });

      const embeddedById = new Map(embedEntries.map((entry) => [entry.id, entry]));
      const nextMarkups = markupsRef.current.map((entry) => {
        const embedded = embeddedById.get(entry.id);
        if (!embedded) return entry;
        const first = embedded.pdfRects[0];
        return {
          ...entry,
          source: /** @type {const} */ ('pdf'),
          pdfRect: first
            ? [first.x, first.y, first.x + first.width, first.y + first.height]
            : entry.pdfRect,
        };
      });
      markupsRef.current = nextMarkups;
      setMarkups(nextMarkups);
      removedPdfMarkupsRef.current = [];
      setRemovedPdfMarkups([]);
      marksCompleteRef.current = true;
      await writePdfViewerSidecar(relativePath, {
        view: {
          page: currentPageRef.current,
          zoomMode: zoomModeRef.current,
          customScale: customScaleRef.current,
          rotation: rotationRef.current,
          twoPageView: twoPageViewRef.current,
        },
        markups: nextMarkups,
        removed: [],
        marksComplete: true,
      });

      setSaveMessage('원본 PDF에 저장했습니다.');
      skipViewerSaveRef.current = false;
    } catch (err) {
      console.warn('[pdf] save to file failed:', err);
      setSaveMessage(err instanceof Error ? err.message : '원본 저장에 실패했습니다.');
      skipViewerSaveRef.current = false;
    } finally {
      setSavingToFile(false);
    }
  }, [relativePath, savingToFile]);

  const openSearchBar = useCallback(() => {
    setShowSearchBar(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearchBar = useCallback(() => {
    setShowSearchBar(false);
  }, []);

  const highlightAppliedKeyRef = useRef('');
  useEffect(() => {
    if (!docReady) highlightAppliedKeyRef.current = '';
  }, [docReady]);
  useEffect(() => {
    const query = String(highlightQuery ?? '').trim();
    if (!query || !docReady || !pdfRef.current) return;
    const key = `${relativePath}\0${query}`;
    if (highlightAppliedKeyRef.current === key) return;
    highlightAppliedKeyRef.current = key;
    setSearchQuery(query);
    openSearchBar();
    void runSearch(query);
  }, [docReady, highlightQuery, openSearchBar, relativePath, runSearch]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearchBar();
        return;
      }

      if (event.key === 'Escape' && showSearchBar) {
        event.preventDefault();
        closeSearchBar();
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

      if (event.key === 'PageDown') {
        event.preventDefault();
        handleFabNavigate('down');
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        handleFabNavigate('up');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(currentPage + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canSaveToFile,
    closeSearchBar,
    copyActiveMarkupText,
    currentPage,
    goNextMatch,
    goPrevMatch,
    goToPage,
    handleSaveToFile,
    openSearchBar,
    removeMarkup,
    resetZoom,
    showSearchBar,
    handleFabNavigate,
    zoomBy,
  ]);

  // Browser (Onyx Chrome): capture volume-shaped page keys. Cannot mute system volume.
  useEffect(() => {
    if (!docReady) return undefined;
    if (window.nas4usb?.pdfViewer?.setVolumeKeysForPaging) return undefined;

    const onPhysicalPageKey = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const direction = physicalPageKeyDirection(event);
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      handleFabNavigate(direction);
    };

    window.addEventListener('keydown', onPhysicalPageKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onPhysicalPageKey, { capture: true });
    };
  }, [docReady, handleFabNavigate]);

  // Electron: intercept volume keys before the OS changes volume.
  useEffect(() => {
    if (!docReady) return undefined;
    const api = window.nas4usb?.pdfViewer;
    if (!api?.setVolumeKeysForPaging || !api?.subscribeVolumePageTurn) return undefined;

    void api.setVolumeKeysForPaging(true);
    const unsubscribe = api.subscribeVolumePageTurn((direction) => {
      if (direction === 'next') handleFabNavigate('down');
      else if (direction === 'prev') handleFabNavigate('up');
    });

    return () => {
      unsubscribe?.();
      void api.setVolumeKeysForPaging(false);
    };
  }, [docReady, handleFabNavigate]);

  useEffect(() => {
    if (!docReady) return undefined;
    const timer = window.setTimeout(() => updateScrollEdges(), 80);
    return () => window.clearTimeout(timer);
  }, [docReady, zoomMode, displayScale, pageCount, rendering, updateScrollEdges]);


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
      raised={raised}
      actions={
        <AppModalButton
          className="modal-btn--icon"
          onClick={() => void handleSaveToFile()}
          disabled={!canSaveToFile}
          title={savingToFile ? '저장 중…' : '저장 (Ctrl+S)'}
          aria-label={savingToFile ? '저장 중…' : '저장'}
        >
          {savingToFile ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <IconSave />
          )}
        </AppModalButton>
      }
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <AppModal
        open={passwordOpen}
        onClose={cancelPdfPassword}
        title="PDF 암호"
        raised
        showCloseButton
      >
        <AppModalBody>
          <p className="text-sm text-slate-600">
            {passwordHint || '이 PDF는 암호로 보호되어 있습니다.'}
          </p>
          <label className="mt-3 block text-sm text-slate-700">
            암호
            <input
              ref={passwordInputRef}
              type="password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-nas-accent"
              value={passwordValue}
              autoComplete="current-password"
              disabled={passwordBusy}
              onChange={(event) => setPasswordValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitPdfPassword();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelPdfPassword();
                }
              }}
            />
          </label>
        </AppModalBody>
        <AppModalActions>
          <AppModalButton variant="primary" onClick={submitPdfPassword} disabled={passwordBusy}>
            열기
          </AppModalButton>
          <AppModalButton onClick={cancelPdfPassword} disabled={passwordBusy}>
            취소
          </AppModalButton>
        </AppModalActions>
      </AppModal>

      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1">
        <button
          type="button"
          className={`pdf-tb-btn ${showThumbnails ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={() => toggleSidePanel('thumbs')}
          title="썸네일 패널"
          aria-label="썸네일 패널"
          aria-pressed={showThumbnails}
        >
          <IconPdfThumbs />
        </button>
        <button
          type="button"
          className={`pdf-tb-btn ${showMarksPanel ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={() => toggleSidePanel('marks')}
          title="형광펜 · 밑줄 목록"
          aria-label="형광펜 · 밑줄 목록"
          aria-pressed={showMarksPanel}
        >
          <IconPdfHighlight />
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="pdf-tb-btn"
          disabled={
            busy ||
            (zoomMode === 'fitWidth' ? scrollEdges.atTop : currentPage <= 1)
          }
          onClick={() => handleFabNavigate('up')}
          title={zoomMode === 'fitWidth' ? '위로 스크롤' : '이전 페이지'}
          aria-label={zoomMode === 'fitWidth' ? '위로 스크롤' : '이전 페이지'}
        >
          <IconPdfChevronLeft />
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
        <span className="px-0.5 text-xs text-slate-500">/ {pageCount || '—'}</span>
        <button
          type="button"
          className="pdf-tb-btn"
          disabled={
            busy ||
            (zoomMode === 'fitWidth' ? scrollEdges.atBottom : currentPage >= pageCount)
          }
          onClick={() => handleFabNavigate('down')}
          title={zoomMode === 'fitWidth' ? '아래로 스크롤' : '다음 페이지'}
          aria-label={zoomMode === 'fitWidth' ? '아래로 스크롤' : '다음 페이지'}
        >
          <IconPdfChevronRight />
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="pdf-tb-btn"
          disabled={busy || displayScale <= PDF_MIN_SCALE}
          onClick={() => zoomBy('out')}
          title="축소 (Ctrl+-)"
          aria-label="축소"
        >
          <IconPdfZoomOut />
        </button>
        <button
          type="button"
          className="pdf-tb-btn min-w-[2.75rem] px-1 text-xs font-medium"
          disabled={busy}
          onClick={resetZoom}
          title="실제 크기 100% (Ctrl+0)"
          aria-label={`현재 배율 ${zoomPercent}%`}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className="pdf-tb-btn"
          disabled={busy || displayScale >= PDF_MAX_SCALE}
          onClick={() => zoomBy('in')}
          title="확대 (Ctrl+=)"
          aria-label="확대"
        >
          <IconPdfZoomIn />
        </button>
        <button
          type="button"
          className={`pdf-tb-btn ${zoomMode === 'fitWidth' ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={setFitWidth}
          title="너비에 맞춤"
          aria-label="너비에 맞춤"
          aria-pressed={zoomMode === 'fitWidth'}
        >
          <IconPdfFitWidth />
        </button>
        <button
          type="button"
          className={`pdf-tb-btn ${zoomMode === 'fitHeight' ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={setFitHeight}
          title="높이에 맞춤"
          aria-label="높이에 맞춤"
          aria-pressed={zoomMode === 'fitHeight'}
        >
          <IconPdfFitHeight />
        </button>
        <button
          type="button"
          className={`pdf-tb-btn ${zoomMode === 'fitPage' ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={setFitPage}
          title="페이지 맞춤"
          aria-label="페이지 맞춤"
          aria-pressed={zoomMode === 'fitPage'}
        >
          <IconPdfFitPage />
        </button>
        <button
          type="button"
          className={`pdf-tb-btn ${twoPageView ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy || pageCount < 2}
          onClick={toggleTwoPageView}
          title="두 페이지를 나란히 보기"
          aria-label="두 페이지를 나란히 보기"
          aria-pressed={twoPageView}
        >
          <IconPdfTwoPages />
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className="pdf-tb-btn"
          disabled={busy}
          onClick={rotateClockwise}
          title="시계 방향 회전"
          aria-label="시계 방향 회전"
        >
          <IconPdfRotate />
        </button>
        <button
          type="button"
          className="pdf-tb-btn"
          disabled={busy}
          onClick={handlePrint}
          title="인쇄"
          aria-label="인쇄"
        >
          <IconPdfPrint />
        </button>
        <button
          type="button"
          className="pdf-tb-btn pdf-tb-btn--export"
          disabled={busy || markups.length === 0}
          onClick={handleExportMarkups}
          title="형광펜·밑줄을 Excel로 내보내기"
          aria-label="형광펜 내보내기"
        >
          <IconPdfExportExcel />
        </button>

        <span className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          className={`pdf-tb-btn ${showSearchBar ? 'pdf-tb-btn--active' : ''}`}
          disabled={busy}
          onClick={() => (showSearchBar ? closeSearchBar() : openSearchBar())}
          title="검색 (Ctrl+F)"
          aria-label="검색"
          aria-pressed={showSearchBar}
        >
          <IconPdfSearch />
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
      {showSearchBar ? (
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
          <button
            type="button"
            className="pdf-tb-btn"
            onClick={closeSearchBar}
            title="검색 닫기 (Esc)"
            aria-label="검색 닫기"
          >
            <IconPdfSearchClose />
          </button>
        </div>
      ) : null}

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
            className="pdf-marks-rail flex h-full min-h-0 shrink-0 flex-col border-r border-slate-300 bg-slate-50"
            style={{ width: PDF_SIDE_RAIL_WIDTH_PX }}
            aria-label="형광펜 · 밑줄 목록"
          >
            <div className="border-b border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700">
              형광펜 ({markups.length})
              {markupScanPending ? ' · 불러오는 중' : ''}
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
                <p className="px-1 py-2 text-[11px] leading-relaxed text-slate-600">
                  {markupScanPending
                    ? 'PDF에 저장된 형광펜을 불러오는 중입니다. 페이지가 많을수록 조금 걸릴 수 있습니다.'
                    : '형광펜이나 밑줄 친 내용이 없습니다. 본문에서 텍스트를 선택한 뒤 메뉴에서 형광펜·밑줄을 추가하고 [저장]으로 원본 PDF에 기록하세요. 태블릿은 손가락으로 스크롤하고, 텍스트는 더블 탭한 뒤 파란 핸들로 범위를 조절하세요. 읽던 위치는 자동 보관됩니다.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {sortedMarkups.map((entry) => {
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
                            <span className="block truncate text-[12px] font-medium text-slate-800">
                              {entry.text || '(표시)'}
                            </span>
                            <span className="block text-[11px] text-slate-600">
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
              {passwordOpen
                ? '암호 입력 대기 중…'
                : loading
                  ? 'PDF 불러오는 중…'
                  : '레이아웃 준비 중…'}
            </p>
          )}
          <div ref={scrollRef} className="pdf-scroll h-full min-h-0 overflow-auto p-3" />

          {selectionMenu &&
            createPortal(
              <div
                data-pdf-selection-menu="1"
                className="pdf-selection-menu"
                style={{
                  left: Math.min(
                    Math.max(8, selectionMenu.clientX - 140),
                    window.innerWidth - 320,
                  ),
                  top: Math.min(
                    Math.max(8, selectionMenu.clientY - 168),
                    window.innerHeight - 190,
                  ),
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
        .pdf-tb-btn {
          display: inline-flex;
          height: 1.75rem;
          width: 1.75rem;
          align-items: center;
          justify-content: center;
          border-radius: 0.375rem;
          border: none;
          background: transparent;
          color: #475569;
          cursor: pointer;
        }
        .pdf-tb-btn:hover:not(:disabled) {
          background: #e2e8f0;
          color: #0f172a;
        }
        .pdf-tb-btn:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }
        .pdf-tb-btn--active {
          background: #e0f2fe;
          color: #0369a1;
        }
        .pdf-tb-btn--export {
          color: #2563eb;
        }
        .pdf-tb-btn--export:hover:not(:disabled) {
          background: #dbeafe;
          color: #1d4ed8;
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
          /* Allow finger pan/scroll; long-press arms text selection in JS. */
          touch-action: pan-x pan-y;
          background: transparent;
        }
        .pdf-live-selection {
          position: absolute;
          background: rgba(51, 153, 255, 0.35);
          border-radius: 1px;
        }
        .pdf-sel-handle {
          position: absolute;
          z-index: 7;
          width: 28px;
          height: 28px;
          margin-left: -14px;
          margin-top: -14px;
          border-radius: 50%;
          background: #3380ff;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
          pointer-events: auto;
          touch-action: none;
          box-sizing: border-box;
          cursor: grab;
        }
        .pdf-sel-handle--start {
          cursor: grab;
        }
        .pdf-sel-handle--end {
          cursor: grab;
        }
        .pdf-sel-handle::after {
          content: '';
          position: absolute;
          left: 50%;
          width: 2px;
          height: 16px;
          margin-left: -1px;
          background: #3380ff;
          pointer-events: none;
        }
        .pdf-sel-handle--start::after {
          top: 26px;
        }
        .pdf-sel-handle--end::after {
          bottom: 26px;
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
        html.touch-ui .pdf-markup--highlight {
          opacity: 0.72;
          mix-blend-mode: multiply;
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
          min-width: 300px;
          padding: 10px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
          color: #333;
        }
        .pdf-selection-menu__row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }
        .pdf-selection-menu__action {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: 3.75rem;
          min-width: 3.75rem;
          min-height: 40px;
          padding: 8px 10px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: #333;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .pdf-selection-menu__action:hover {
          background: #ebebeb;
        }
        .pdf-selection-menu__action--full {
          width: 100%;
          min-width: 0;
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
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid #aaa;
          flex-shrink: 0;
        }
        .pdf-selection-menu__swatch--underline {
          background: transparent;
          border: none;
          border-bottom: 3px solid;
          border-radius: 0;
          height: 10px;
        }
        .pdf-selection-menu__colors {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pdf-color-chip {
          width: 34px;
          height: 34px;
          min-width: 34px;
          min-height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.25);
          padding: 0;
          cursor: pointer;
          touch-action: manipulation;
          flex-shrink: 0;
        }
        .pdf-color-chip--active {
          outline: 2px solid #0ea5e9;
          outline-offset: 2px;
        }
        .pdf-mark-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        html.touch-ui .pdf-mark-item {
          padding: 10px 8px;
          border-color: #94a3b8;
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
