import { resolveFileEntryStatus } from '../../lib/fileEntryStatus.js';

/** [비] + [열쇠] + [링크] 3칸 (18px × 3 + gap 0.5 × 2) */
export const FILE_STATUS_SLOT_WIDTH = 58;

const ICON_BADGE_CLASS =
  'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm text-[10pt] font-semibold leading-none';

const STATUS_SLOT_CLASS = `inline-flex h-[18px] shrink-0 items-center gap-0.5`;

function VisibilityBadge() {
  return (
    <span
      className={`${ICON_BADGE_CLASS} bg-yellow-100 text-[8pt] text-yellow-800`}
      title="비공개"
      aria-label="비공개"
    >
      비
    </span>
  );
}

function ViewRestrictionBadge() {
  return (
    <span
      className={`${ICON_BADGE_CLASS} bg-rose-50 text-rose-700`}
      title="열람 제한"
      aria-label="열람 제한"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    </span>
  );
}

function ShareLinkBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-sky-50 text-sky-700 transition-colors hover:bg-sky-100`}
      title="공유 링크 복사"
      aria-label="공유 링크 복사"
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
        />
      </svg>
    </button>
  );
}

export default function FileEntryStatusBadges({ entry, accessMap, shareMap, onShareLinkClick }) {
  const status = entry.isDirectory
    ? null
    : resolveFileEntryStatus(entry.relativePath, accessMap, shareMap);

  return (
    <span
      className={STATUS_SLOT_CLASS}
      style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}
      aria-label={status ? '파일 상태' : undefined}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {status?.isPrivate && <VisibilityBadge />}
      {status?.isViewRestricted && <ViewRestrictionBadge />}
      {status?.isSharing && (
        <ShareLinkBadge onClick={() => onShareLinkClick?.(entry)} />
      )}
    </span>
  );
}
