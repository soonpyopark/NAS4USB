/**
 * Overlay prev/next buttons for sibling files in a viewer.
 *
 * @param {{
 *   prev: import('../../types/nas4usb.d.ts').FsEntry | null,
 *   next: import('../../types/nas4usb.d.ts').FsEntry | null,
 *   onOpen: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function SiblingFileSideButtons({ prev, next, onOpen, disabled = false }) {
  if (!prev && !next) return null;

  return (
    <>
      <button
        type="button"
        className="sibling-file-nav sibling-file-nav--prev"
        disabled={disabled || !prev}
        onClick={() => prev && onOpen(prev)}
        title={prev ? `이전 파일: ${prev.name}` : '이전 파일 없음'}
        aria-label={prev ? `이전 파일 ${prev.name}` : '이전 파일 없음'}
      >
        ‹
      </button>
      <button
        type="button"
        className="sibling-file-nav sibling-file-nav--next"
        disabled={disabled || !next}
        onClick={() => next && onOpen(next)}
        title={next ? `다음 파일: ${next.name}` : '다음 파일 없음'}
        aria-label={next ? `다음 파일 ${next.name}` : '다음 파일 없음'}
      >
        ›
      </button>
    </>
  );
}
