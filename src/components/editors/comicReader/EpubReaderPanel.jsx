import { useEffect, useMemo, useState } from 'react';
import {
  buildChapterHtmlDocument,
  openEpubBook,
} from '../../../lib/comicReader/epubBook.js';
import { injectNasScrollbarStyle } from '../../../lib/ui/nasScrollbarStyle.js';

/**
 * @param {{
 *   data: ArrayBuffer,
 *   fontScale: number,
 * }} props
 */
export default function EpubReaderPanel({ data, fontScale }) {
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState(/** @type {import('../../../lib/comicReader/epubBook.js').OpenedEpub | null} */ (null));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /** @type {null | (() => void)} */
    let revoke = null;
    setLoading(true);
    setError(null);
    setBook(null);
    setIndex(0);

    async function load() {
      try {
        const opened = await openEpubBook(data);
        if (cancelled) {
          opened.revoke();
          return;
        }
        revoke = opened.revoke;
        setBook(opened);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'EPUB을 열지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [data]);

  useEffect(() => {
    if (!book) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((prev) => Math.min(book.spine.length - 1, prev + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book]);

  const srcDoc = useMemo(() => {
    if (!book) return '';
    return buildChapterHtmlDocument(book, index, fontScale);
  }, [book, index, fontScale]);

  const status = useMemo(() => {
    if (!book) return '';
    return `${index + 1} / ${book.spine.length}`;
  }, [book, index]);

  return (
    <div className="comic-reader-epub">
      {loading && <p className="comic-reader-status">EPUB 불러오는 중…</p>}
      {error && <p className="comic-reader-error">{error}</p>}
      {!loading && !error && (
        <>
          <iframe
            className="comic-reader-epub-frame"
            title={book?.title || 'EPUB'}
            srcDoc={srcDoc}
            sandbox="allow-same-origin"
            onLoad={(event) => injectNasScrollbarStyle(event.currentTarget.contentDocument)}
          />
          <div className="comic-reader-epub-nav">
            <button
              type="button"
              disabled={!book || index <= 0}
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            >
              이전
            </button>
            <span className="comic-reader-epub-page">{status}</span>
            <button
              type="button"
              disabled={!book || index >= book.spine.length - 1}
              onClick={() => setIndex((prev) => Math.min(book.spine.length - 1, prev + 1))}
            >
              다음
            </button>
          </div>
        </>
      )}
    </div>
  );
}
