import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import { buildMediaStreamUrl } from '../../lib/media/streamUrl.js';
import { getPdfMimeType } from '../../lib/media/mediaTypes.js';
import {
  PDF_MAX_SCALE,
  PDF_MIN_SCALE,
  computeFitPageScale,
  computeFitWidthScale,
  destroyPdfDocument,
  loadPdfDocument,
  searchPdfDocument,
  stepZoomScale,
} from '../../lib/pdf/pdfjs.js';

/**
 * @typedef {'fitWidth' | 'fitPage' | 'custom'} PdfZoomMode
 */

const THUMB_CSS_WIDTH = 112;
const THUMB_MAX_CONCURRENT = 2;
const THUMB_ROOT_MARGIN = '240px 0px';

/**
 * Chromium-like PDF.js viewer: zoom, page nav, rotate, download, print, search.
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
  const streamUrl = useMemo(() => buildMediaStreamUrl(relativePath), [relativePath]);
  const absoluteStreamUrl = useMemo(() => {
    try {
      return new URL(streamUrl, window.location.origin).href;
    } catch {
      return streamUrl;
    }
  }, [streamUrl]);

  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const thumbScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const pdfRef = useRef(/** @type {import('pdfjs-dist').PDFDocumentProxy | null} */ (null));
  const pageCanvasRefs = useRef(/** @type {Map<number, HTMLCanvasElement>} */ (new Map()));
  const highlightLayerRefs = useRef(/** @type {Map<number, HTMLDivElement>} */ (new Map()));
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
  const [docReady, setDocReady] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);

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

  const clearHighlights = useCallback(() => {
    for (const layer of highlightLayerRefs.current.values()) {
      layer.replaceChildren();
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

  const resolveRenderScale = useCallback(async (pdf, mode, custom, rot) => {
    const page = await pdf.getPage(1);
    const scroller = scrollRef.current;
    const width = Math.max(240, (scroller?.clientWidth ?? 800) - 24);
    const height = Math.max(240, (scroller?.clientHeight ?? 600) - 24);

    if (mode === 'fitWidth') return computeFitWidthScale(page, width, rot);
    if (mode === 'fitPage') return computeFitPageScale(page, { width, height }, rot);
    return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, custom));
  }, []);

  const renderAllPages = useCallback(
    async (pdf, { mode, custom, rot }) => {
      const container = scrollRef.current;
      if (!container || !pdf) return;

      const token = ++renderTokenRef.current;
      setRendering(true);

      try {
        const nextScale = await resolveRenderScale(pdf, mode, custom, rot);
        if (token !== renderTokenRef.current) return;

        setDisplayScale(nextScale);
        displayScaleRef.current = nextScale;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bufferScale = nextScale * dpr;
        const keepPage = currentPageRef.current;

        container.replaceChildren();
        pageCanvasRefs.current.clear();
        highlightLayerRefs.current.clear();
        pageViewportRefs.current.clear();

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (token !== renderTokenRef.current) return;

          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: bufferScale, rotation: rot });
          const cssWidth = Math.floor(viewport.width / dpr);
          const cssHeight = Math.floor(viewport.height / dpr);

          const pageWrap = document.createElement('div');
          pageWrap.className = 'pdf-page-wrap';
          pageWrap.dataset.pdfPage = String(pageNumber);

          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          pageCanvasRefs.current.set(pageNumber, canvas);
          pageViewportRefs.current.set(pageNumber, viewport);

          const highlightLayer = document.createElement('div');
          highlightLayer.className = 'pdf-highlight-layer';
          highlightLayerRefs.current.set(pageNumber, highlightLayer);

          pageWrap.append(canvas, highlightLayer);
          container.appendChild(pageWrap);

          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;
          await page.render({ canvasContext: context, viewport, canvas }).promise;
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

        reapplyActiveHighlights();
        setRendering(false);
      } catch (err) {
        if (token === renderTokenRef.current) {
          setRendering(false);
          setLoadError(err instanceof Error ? err.message : 'PDF 렌더링에 실패했습니다.');
        }
      }
    },
    [reapplyActiveHighlights, resolveRenderScale],
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

  // Load document once per stream URL.
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
      pdfRef.current = null;

      try {
        pdf = await loadPdfDocument(streamUrl);
        if (cancelled) {
          await destroyPdfDocument(pdf);
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setDocReady(true);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'PDF를 표시할 수 없습니다.');
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      renderTokenRef.current += 1;
      teardownThumbnails();
      pdfRef.current = null;
      void destroyPdfDocument(pdf);
    };
  }, [clearSearch, streamUrl, teardownThumbnails]);

  // Re-render when zoom mode / custom scale / rotation changes (and on first ready).
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!docReady || !pdf || loading) return;
    void renderAllPages(pdf, { mode: zoomMode, custom: customScale, rot: rotation });
  }, [customScale, docReady, loading, renderAllPages, rotation, zoomMode]);

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
      const mid = scroller.scrollTop + scroller.clientHeight * 0.35;
      let best = 1;
      let bestDist = Infinity;
      pages.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const dist = Math.abs(node.offsetTop - mid);
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
  }, [pageCount, rendering]);

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
        void renderAllPages(pdf, { mode: zoomMode, custom: customScale, rot: rotation });
      }, 120);
    });
    observer.observe(scroller);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [customScale, docReady, renderAllPages, rotation, zoomMode]);

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
  const setFitPage = useCallback(() => setZoomMode('fitPage'), []);
  const resetZoom = useCallback(() => {
    setZoomMode('custom');
    setCustomScale(1);
  }, []);
  const rotateClockwise = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleDownload = useCallback(() => {
    const anchor = document.createElement('a');
    anchor.href = absoluteStreamUrl;
    anchor.download = fileName || 'document.pdf';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [absoluteStreamUrl, fileName]);

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
  }, [currentPage, goNextMatch, goPrevMatch, goToPage, resetZoom, zoomBy]);

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
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${showThumbnails ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={() => setShowThumbnails((prev) => !prev)}
          title="썸네일 패널"
          aria-pressed={showThumbnails}
        >
          썸네일
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
          className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs outline-none focus:border-sky-500"
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
        >
          너비 맞춤
        </button>
        <button
          type="button"
          className={`nas-btn-ghost text-xs ${zoomMode === 'fitPage' ? 'bg-slate-200' : ''}`}
          disabled={busy}
          onClick={setFitPage}
        >
          페이지 맞춤
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
          onClick={handleDownload}
          title="다운로드"
        >
          다운로드
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
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <label className="sr-only" htmlFor="pdf-search-input">
          PDF 텍스트 검색
        </label>
        <input
          id="pdf-search-input"
          ref={searchInputRef}
          type="search"
          className="min-w-[180px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
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
            className="pdf-thumb-rail flex w-[148px] shrink-0 flex-col border-r border-slate-300 bg-slate-100"
            aria-label="페이지 썸네일"
          >
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

        <div className="relative min-h-0 min-w-0 flex-1">
          {(loading || rendering) && !loadError && (
            <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600">
              {loading ? 'PDF 불러오는 중…' : '다시 그리는 중…'}
            </p>
          )}
          <div ref={scrollRef} className="pdf-scroll h-full min-h-0 overflow-auto p-3" />
        </div>
      </div>

      <style>{`
        .pdf-scroll { scrollbar-gutter: stable; }
        .pdf-page-wrap {
          position: relative;
          width: fit-content;
          max-width: 100%;
          margin: 0 auto 12px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
          background: #fff;
        }
        .pdf-page-canvas { display: block; max-width: 100%; height: auto; }
        .pdf-highlight-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
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
