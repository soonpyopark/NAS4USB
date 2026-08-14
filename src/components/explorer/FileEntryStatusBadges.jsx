import { resolveFileEntryStatus } from '../../lib/fileEntryStatus.js';

/** [별] + [비] + [열쇠] + [링크] 4칸 (18px × 4 + gap 0.5 × 3) */
export const FILE_STATUS_SLOT_WIDTH = 76;

const ICON_BADGE_CLASS =
  'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm text-[10pt] font-semibold leading-none';

const STATUS_SLOT_CLASS = `inline-flex h-[18px] shrink-0 items-center gap-0.5`;

function ShareLinkIcon() {
  return (
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
  );
}

function VisibilityBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-yellow-100 text-[8pt] text-yellow-800 transition-colors hover:bg-yellow-200`}
      title="비공개 · 속성"
      aria-label="비공개 · 속성"
    >
      비
    </button>
  );
}

function ViewRestrictionBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100`}
      title="열람 제한 · 속성"
      aria-label="열람 제한 · 속성"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    </button>
  );
}

function ShareViewOnlyBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-red-50 text-red-700 transition-colors hover:bg-red-100`}
      title="공유(보기 전용) · 링크 복사"
      aria-label="공유(보기 전용) · 링크 복사"
    >
      <ShareLinkIcon />
    </button>
  );
}

function ShareEditableBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-green-50 text-green-700 transition-colors hover:bg-green-100`}
      title="공유(편집 가능) · 링크 복사"
      aria-label="공유(편집 가능) · 링크 복사"
    >
      <ShareLinkIcon />
    </button>
  );
}

function FavoriteBadge({ onClick }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`${ICON_BADGE_CLASS} cursor-pointer bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100`}
      title="즐겨찾기 · 속성"
      aria-label="즐겨찾기 · 속성"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.25l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 15.9l-5.04 2.88.96-5.62-4.08-3.98 5.64-.82L12 2.25z" />
      </svg>
    </button>
  );
}

export default function FileEntryStatusBadges({
  entry,
  accessMap,
  shareMap,
  favoritesMap = {},
  onShareLinkClick,
  onPropertiesClick,
}) {
  const status = entry.isDirectory
    ? null
    : resolveFileEntryStatus(entry.relativePath, accessMap, shareMap, favoritesMap);
  const showFavorite = entry.isDirectory
    ? Boolean(favoritesMap[entry.relativePath])
    : Boolean(status?.isFavorite);

  const openProperties = () => onPropertiesClick?.(entry);

  return (
    <span
      className={STATUS_SLOT_CLASS}
      style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}
      aria-label={status || showFavorite ? '파일 상태' : undefined}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {showFavorite && <FavoriteBadge onClick={openProperties} />}
      {status?.isPrivate && <VisibilityBadge onClick={openProperties} />}
      {status?.isViewRestricted && <ViewRestrictionBadge onClick={openProperties} />}
      {status?.isShareViewOnly && (
        <ShareViewOnlyBadge onClick={() => onShareLinkClick?.(entry)} />
      )}
      {status?.isShareEditable && (
        <ShareEditableBadge onClick={() => onShareLinkClick?.(entry)} />
      )}
    </span>
  );
}
