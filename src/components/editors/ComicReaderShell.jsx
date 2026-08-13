import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import SiblingFileSideButtons from './SiblingFileSideButtons.jsx';
import { AppModalButton } from '../common/AppModal.jsx';
import ComicReaderView from './comicReader/ComicReaderView.jsx';
import EpubReaderPanel from './comicReader/EpubReaderPanel.jsx';
import { useSiblingFileNav } from '../../hooks/useSiblingFileNav.js';
import { resolveReaderPages } from '../../lib/comicReader/resolveReaderPages.js';
import { isImageExtension } from '../../lib/media/mediaTypes.js';

const MODE_STORAGE_KEY = 'nas4usb.comicReader.mode';
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.1;

/** @typedef {'vertical' | 'ltr' | 'rtl' | 'dual'} ReaderMode */

/**
 * @returns {ReaderMode}
 */
function loadMode() {
  try {
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    if (value === 'vertical' || value === 'ltr' || value === 'rtl' || value === 'dual') {
      return value;
    }
  } catch {
    // ignore
  }
  return 'vertical';
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 *   onOpenSibling?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void | Promise<boolean>,
 * }} props
 */
export default function ComicReaderShell({
  relativePath,
  fileName,
  extension,
  onClose,
  allowClose = true,
  fullscreen = false,
  onOpenSibling,
}) {
  const isImageFile = isImageExtension(extension);
  const { prev: prevSibling, next: nextSibling } = useSiblingFileNav(
    relativePath,
    'image',
    isImageFile && Boolean(onOpenSibling),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [resolved, setResolved] = useState(/** @type {import('../../lib/comicReader/resolveReaderPages.js').ReaderResolved | null} */ (null));
  const [mode, setMode] = useState(/** @type {ReaderMode} */ (loadMode));
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const revokeRef = useRef(/** @type {(() => void | Promise<void>) | null} */ (null));

  const openSibling = useCallback(
    (entry) => {
      if (!entry || !onOpenSibling) return;
      void onOpenSibling(entry);
    },
    [onOpenSibling],
  );

  useEffect(() => {
    let cancelled = false;
    revokeRef.current = null;

    async function load() {
      setLoading(true);
      setError(null);
      setResolved(null);
      setPageIndex(0);
      try {
        const next = await resolveReaderPages(relativePath, extension);
        if (cancelled) {
          await next.revoke();
          return;
        }
        revokeRef.current = next.revoke;
        setResolved(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '파일을 열지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      const revoke = revokeRef.current;
      revokeRef.current = null;
      if (revoke) {
        Promise.resolve(revoke()).catch(() => {});
      }
    };
  }, [relativePath, extension]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const pageCount = resolved?.pageCount ?? 0;
  const isEpub = resolved?.kind === 'epub';

  const goRelative = useCallback(
    (delta) => {
      if (!pageCount) return;
      setPageIndex((prev) => {
        const step = mode === 'dual' ? 2 : 1;
        const next = prev + delta * step;
        return Math.max(0, Math.min(pageCount - 1, next));
      });
    },
    [mode, pageCount],
  );

  useEffect(() => {
    if (isEpub) return undefined;
    /**
     * @param {KeyboardEvent} event
     */
    const onKey = (event) => {
      if (event.key === 'Escape' && allowClose) {
        onClose();
        return;
      }

      // Single-image files: ←/→ move between sibling images in the folder.
      if (isImageFile && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const target = event.key === 'ArrowLeft' ? prevSibling : nextSibling;
        if (target) {
          event.preventDefault();
          openSibling(target);
        }
        return;
      }

      if (mode === 'vertical') return;
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault();
        goRelative(mode === 'rtl' ? -1 : 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goRelative(mode === 'rtl' ? 1 : -1);
      } else if (event.key === 'Home') {
        setPageIndex(0);
      } else if (event.key === 'End' && pageCount) {
        setPageIndex(pageCount - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    allowClose,
    goRelative,
    isEpub,
    isImageFile,
    mode,
    nextSibling,
    onClose,
    openSibling,
    pageCount,
    prevSibling,
  ]);

  const zoomBy = useCallback((direction) => {
    setScale((prev) => {
      const next = direction === 'in' ? prev + SCALE_STEP : prev - SCALE_STEP;
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 100) / 100));
    });
  }, []);

  const subtitle = useMemo(() => {
    if (isEpub) return 'EPUB';
    if (isImageFile) return '이미지';
    if (!pageCount) return null;
    if (mode === 'vertical') return `${pageCount}페이지 · 세로`;
    const display = mode === 'dual' ? `${pageIndex + 1}–${Math.min(pageIndex + 2, pageCount)}` : `${pageIndex + 1}`;
    return `${display} / ${pageCount}`;
  }, [isEpub, isImageFile, mode, pageCount, pageIndex]);

  const actions = (
    <>
      {!isEpub && !isImageFile && (
        <>
          <select
            className="comic-reader-mode-select"
            value={mode}
            onChange={(event) => setMode(/** @type {ReaderMode} */ (event.target.value))}
            aria-label="읽기 모드"
          >
            <option value="vertical">세로</option>
            <option value="ltr">좌→우</option>
            <option value="rtl">우→좌</option>
            <option value="dual">두 쪽</option>
          </select>
          {mode !== 'vertical' && (
            <>
              <AppModalButton onClick={() => goRelative(mode === 'rtl' ? 1 : -1)}>이전</AppModalButton>
              <AppModalButton onClick={() => goRelative(mode === 'rtl' ? -1 : 1)}>다음</AppModalButton>
            </>
          )}
        </>
      )}
      <AppModalButton onClick={() => zoomBy('out')}>−</AppModalButton>
      <AppModalButton onClick={() => setScale(1)}>{Math.round(scale * 100)}%</AppModalButton>
      <AppModalButton onClick={() => zoomBy('in')}>+</AppModalButton>
    </>
  );

  return (
    <ViewerModal
      title={fileName}
      subtitle={subtitle}
      actions={actions}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      <div className="comic-reader-root">
        {isImageFile && onOpenSibling ? (
          <SiblingFileSideButtons
            prev={prevSibling}
            next={nextSibling}
            onOpen={openSibling}
            disabled={loading}
          />
        ) : null}
        {loading && <p className="comic-reader-status">불러오는 중…</p>}
        {error && <p className="comic-reader-error">{error}</p>}
        {!loading && !error && resolved?.kind === 'epub' && resolved.epubData && (
          <EpubReaderPanel data={resolved.epubData} fontScale={scale} />
        )}
        {!loading && !error && resolved && resolved.kind !== 'epub' && (
          <ComicReaderView
            mode={mode}
            pages={resolved.pages}
            kind={resolved.kind}
            pdfDocument={resolved.pdfDocument ?? null}
            pageIndex={pageIndex}
            scale={scale}
            onPageIndexChange={setPageIndex}
          />
        )}
        {!loading && !error && resolved && resolved.kind !== 'epub' && resolved.pages.length === 0 && (
          <p className="comic-reader-status">표시할 이미지가 없습니다.</p>
        )}
      </div>
    </ViewerModal>
  );
}
