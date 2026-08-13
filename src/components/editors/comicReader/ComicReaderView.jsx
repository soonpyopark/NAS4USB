import { useEffect, useRef, useState } from 'react';
import { renderPdfPageToObjectUrl } from '../../../lib/comicReader/resolveReaderPages.js';

/**
 * @param {{
 *   mode: 'vertical' | 'ltr' | 'rtl' | 'dual',
 *   pages: Array<{ id: string, url?: string, pageNumber?: number, name?: string }>,
 *   kind: 'image' | 'pdf' | 'archive' | 'epub',
 *   pdfDocument?: import('pdfjs-dist').PDFDocumentProxy | null,
 *   pageIndex: number,
 *   scale: number,
 *   onPageIndexChange: (index: number) => void,
 * }} props
 */
export default function ComicReaderView({
  mode,
  pages,
  kind,
  pdfDocument = null,
  pageIndex,
  scale,
  onPageIndexChange,
}) {
  const scrollerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [pdfUrls, setPdfUrls] = useState(/** @type {Record<string, string>} */ ({}));

  useEffect(() => {
    if (kind !== 'pdf' || !pdfDocument) return undefined;
    let cancelled = false;
    /** @type {string[]} */
    const created = [];

    async function hydrateVisible() {
      const indices =
        mode === 'dual'
          ? [pageIndex, pageIndex + 1].filter((i) => i >= 0 && i < pages.length)
          : mode === 'vertical'
            ? Array.from(
                { length: Math.min(8, pages.length - Math.max(0, pageIndex - 1)) },
                (_, offset) => Math.max(0, pageIndex - 1) + offset,
              )
            : [pageIndex];

      /** @type {Record<string, string>} */
      const next = { ...pdfUrls };
      for (const i of indices) {
        const page = pages[i];
        if (!page?.pageNumber || next[page.id]) continue;
        try {
          const url = await renderPdfPageToObjectUrl(pdfDocument, page.pageNumber, 1.4 * scale);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          created.push(url);
          next[page.id] = url;
        } catch {
          // skip failed page
        }
      }
      if (!cancelled) setPdfUrls(next);
    }

    hydrateVisible();
    return () => {
      cancelled = true;
    };
    // Intentionally omit pdfUrls from deps to avoid re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pdfDocument, mode, pageIndex, scale, pages]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(pdfUrls)) {
        URL.revokeObjectURL(url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * @param {{ id: string, url?: string, pageNumber?: number, name?: string }} page
   */
  function pageSrc(page) {
    if (page.url) return page.url;
    return pdfUrls[page.id] ?? '';
  }

  if (mode === 'vertical') {
    return (
      <div
        ref={scrollerRef}
        className="comic-reader-scroller comic-reader-vertical"
        tabIndex={0}
      >
        {pages.map((page, index) => {
          const src = pageSrc(page);
          return (
            <button
              key={page.id}
              type="button"
              className="comic-reader-page-block"
              onClick={() => onPageIndexChange(index)}
            >
              {src ? (
                <img
                  src={src}
                  alt={page.name ?? `page ${index + 1}`}
                  style={{ width: `${Math.round(scale * 100)}%`, maxWidth: '100%' }}
                  loading="lazy"
                />
              ) : (
                <div className="comic-reader-page-placeholder">페이지 {index + 1}</div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const primary = pages[pageIndex];
  const secondary = mode === 'dual' ? pages[pageIndex + 1] : null;
  const ordered =
    mode === 'rtl'
      ? [secondary, primary].filter(Boolean)
      : [primary, secondary].filter(Boolean);

  return (
    <div
      ref={scrollerRef}
      className={`comic-reader-scroller comic-reader-paged comic-reader-${mode}`}
      tabIndex={0}
    >
      <div className="comic-reader-spread" style={{ transform: `scale(${scale})` }}>
        {ordered.map((page) => {
          if (!page) return null;
          const src = pageSrc(page);
          return src ? (
            <img key={page.id} src={src} alt={page.name ?? page.id} className="comic-reader-page-img" />
          ) : (
            <div key={page.id} className="comic-reader-page-placeholder">
              …
            </div>
          );
        })}
      </div>
    </div>
  );
}
