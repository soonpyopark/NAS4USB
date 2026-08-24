import { useEffect, useRef, useState } from 'react';
import { useExternalFolders } from '../../hooks/useExternalFolders.js';
import { useTouchUi } from '../../hooks/useTouchUi.js';
import { EXTERNAL_FOLDER, SHARED_FOLDER } from '../../../shared/constants.js';
import { HOMES_FOLDER } from '../../../shared/memberHomes.js';
import { isFixedFolderOrderPath } from '../../../shared/folderOrder.js';
import { favoriteAncestorLabel } from '../../lib/favoritesPaths.js';
import { entryExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import EntryMenuButton, { BoxedDotsIcon } from './EntryMenuButton.jsx';
import FileIcon, { fileTypeColorClass } from './FileIcon.jsx';
import FileEntryStatusBadges, { FILE_STATUS_SLOT_WIDTH } from './FileEntryStatusBadges.jsx';
import { FILE_INDENT_STEP_PX } from '../../../shared/fileIndent.js';

const COLLAPSE_SLOT_CLASS = 'inline-flex h-8 w-8 min-w-8 shrink-0 items-center justify-center';

const REORDER_MIME = 'application/x-nas4usb-reorder';
const DRAG_SCROLL_MIN_PX = 6;
const DRAG_SCROLL_MAX_PX = 22;
const DRAG_SCROLL_ABOVE_PX = 36;

/**
 * Sticky thead occupies the scrollport's top edge, so Chromium's native
 * HTML5 drag autoscroll only fires at the bottom. Scroll up while the
 * pointer sits on (or just above) the header band.
 * @param {number} clientY
 * @param {HTMLElement | null} scroller
 */
function dragAutoScrollDelta(clientY, scroller) {
  if (!scroller) return 0;
  const rect = scroller.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const header = scroller.querySelector('thead');
  const headerH = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  const topEdge = Math.max(48, headerH + 12);
  if (clientY < rect.top - DRAG_SCROLL_ABOVE_PX || clientY > rect.bottom) return 0;
  const topDist = clientY - rect.top;
  if (topDist >= topEdge) return 0;
  const intensity = 1 - Math.max(0, topDist) / topEdge;
  return -Math.max(DRAG_SCROLL_MIN_PX, Math.round(DRAG_SCROLL_MAX_PX * intensity));
}

/**
 * @param {number} clientX
 * @param {DOMRect} rect
 */
function isDragPointerOverListX(clientX, rect) {
  return clientX >= rect.left - 16 && clientX <= rect.right + 16;
}

function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function dropPlaceFromEvent(event, { allowInto = false } = {}) {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const ratio = rect.height > 0 ? y / rect.height : 0.5;
  if (allowInto && ratio >= 0.28 && ratio <= 0.72) return 'into';
  return ratio < 0.5 ? 'before' : 'after';
}

/**
 * @param {import('../../types/nas4usb.d.ts').FsEntry | undefined} source
 * @param {import('../../types/nas4usb.d.ts').FsEntry} target
 * @param {React.DragEvent} event
 * @param {{ path: string, place: 'before' | 'after' | 'into' } | null} hinted
 */
function resolveInternalDrop(source, target, event, hinted) {
  if (!source || source.relativePath === target.relativePath) return null;
  if (target.isDirectory) {
    const place =
      hinted?.path === target.relativePath
        ? hinted.place
        : dropPlaceFromEvent(event, { allowInto: true });
    if (place === 'into' || source.isDirectory !== target.isDirectory) {
      return { kind: 'into' };
    }
    return { kind: 'reorder', place };
  }
  if (source.isDirectory !== target.isDirectory) return null;
  const place =
    hinted?.path === target.relativePath ? hinted.place : dropPlaceFromEvent(event);
  if (place === 'into') return null;
  return { kind: 'reorder', place };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedDateLine(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 공유폴더 · 개인폴더 · 외부폴더 (워크스페이스 루트 시스템 폴더) */
function isWorkspaceRootSystemFolder(relativePath) {
  return (
    relativePath === SHARED_FOLDER ||
    relativePath === HOMES_FOLDER ||
    relativePath === EXTERNAL_FOLDER
  );
}

const MODIFIED_DATE_COLUMN_CLASS = 'hidden w-44 min-w-[9.5rem] whitespace-nowrap px-2 py-2 md:table-cell';
const TYPE_COLUMN_CLASS = 'hidden w-36 min-w-[8.5rem] whitespace-nowrap px-2 py-2 lg:table-cell';

function IconSortAsc() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 2.2 10.5 9H1.5L6 2.2z" />
    </svg>
  );
}

function IconSortDesc() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 9.8 1.5 3h9L6 9.8z" />
    </svg>
  );
}

function IconSortCustom() {
  return (
    <svg width="10" height="12" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="8" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="8" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" />
      <circle cx="8" cy="11" r="1.2" />
    </svg>
  );
}

function IconMoveUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M6 11l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMoveDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M6 13l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconIndentLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconIndentRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeaderIconButton({ disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      className="inline-flex h-6 items-center px-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function HeaderButtonGroup({ children }) {
  return (
    <div className="inline-flex items-center rounded-md border border-nas-border bg-white normal-case tracking-normal">
      {children}
    </div>
  );
}

function HeaderButtonDivider() {
  return <span className="h-3.5 w-px bg-nas-border" aria-hidden="true" />;
}

function IndentChevron({ expanded }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      {expanded ? (
        <path d="M4.5 7h11L10 15.5 4.5 7z" />
      ) : (
        <path d="M7 4.5v11L15.5 10 7 4.5z" />
      )}
    </svg>
  );
}

/**
 * @param {{
 *   label: string,
 *   column: 'name' | 'modifiedAt' | 'size' | 'type',
 *   sortField: string,
 *   sortDirection: 'asc' | 'desc',
 *   className?: string,
 *   extra?: import('react').ReactNode,
 *   onSort?: (column: 'name' | 'modifiedAt' | 'size' | 'type') => void,
 * }} props
 */
function SortableHeader({
  label,
  column,
  sortField,
  sortDirection,
  className = '',
  extra = null,
  onSort,
  levelsCollapsed = false,
  canToggleLevels = false,
  onToggleLevels,
}) {
  const active = sortField === column || (column === 'name' && sortField === 'custom');
  const title =
    column === 'name' && sortField === 'custom'
      ? '사용자 정의 순서'
      : active
        ? sortDirection === 'asc'
          ? '오름차순'
          : '내림차순'
        : `${label} 정렬`;

  return (
    <th className={`font-medium ${className}`}>
      <div className={`flex items-center gap-2 ${column === 'name' ? 'min-h-7' : ''}`}>
        {column === 'name' ? (
          <button
            type="button"
            className={`inline-flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-md ${
              canToggleLevels
                ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                : 'cursor-default text-slate-400'
            }`}
            title={
              canToggleLevels
                ? levelsCollapsed
                  ? '하위 파일 펼치기'
                  : '하위 파일 접기'
                : '레벨'
            }
            aria-label={
              canToggleLevels
                ? levelsCollapsed
                  ? '하위 파일 펼치기'
                  : '하위 파일 접기'
                : '레벨'
            }
            disabled={!canToggleLevels}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLevels?.();
            }}
          >
            <IndentChevron expanded={!levelsCollapsed} />
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase tracking-wide text-nas-muted hover:text-slate-700"
          title={title}
          aria-label={title}
          onClick={() => onSort?.(column)}
        >
          <span>{label}</span>
          {column === 'name' && sortField === 'custom' ? (
            <IconSortCustom />
          ) : active && sortDirection === 'asc' ? (
            <IconSortAsc />
          ) : active && sortDirection === 'desc' ? (
            <IconSortDesc />
          ) : (
            <span className="inline-flex w-2.5 opacity-30">
              <IconSortDesc />
            </span>
          )}
        </button>
        {extra}
      </div>
    </th>
  );
}

export default function FileList({
  entries,
  loading,
  selectedSet,
  accessMap = {},
  shareMap = {},
  favoritesMap = {},
  folderColorMap = {},
  nameBoldMap = {},
  onOpen,
  onSelect,
  onToggleCheckbox,
  onToggleSelectAll,
  onContextMenu,
  onBackgroundClick,
  onShareLinkClick,
  onPropertiesClick,
  canReorder = false,
  onReorder,
  canMoveInto = false,
  onMoveInto,
  sortField = 'custom',
  sortDirection = 'asc',
  onSort,
  canMoveOrderUp = false,
  canMoveOrderDown = false,
  onMoveOrderUp,
  onMoveOrderDown,
  showFavoriteLocation = false,
  lockFixedOrder = true,
  fileIndentInfo = {},
  onToggleCollapse,
  canIndent = false,
  canIndentUp = false,
  canIndentDown = false,
  onIndentUp,
  onIndentDown,
  canToggleLevels = false,
  levelsCollapsed = false,
  onToggleLevels,
}) {
  const touchUi = useTouchUi();
  const externalFolders = useExternalFolders();
  const selectAllRef = useRef(null);
  const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const dragPathRef = useRef(/** @type {string | null} */ (null));
  const dragPointerRef = useRef(/** @type {{ x: number, y: number } | null} */ (null));
  const dragScrollRafRef = useRef(0);
  const listClicksRef = useRef(/** @type {{ path: string, time: number }[]} */ ([]));
  const longPressRef = useRef(
    /** @type {{ timer: ReturnType<typeof setTimeout>, x: number, y: number } | null} */ (null),
  );
  const longPressOpenedRef = useRef(false);
  const [dragPath, setDragPath] = useState(/** @type {string | null} */ (null));
  const [dropHint, setDropHint] = useState(
    /** @type {{ path: string, place: 'before' | 'after' | 'into' } | null} */ (null),
  );
  const selectedVisibleCount = entries.filter((entry) => selectedSet.has(entry.relativePath)).length;
  const allVisibleSelected = entries.length > 0 && selectedVisibleCount === entries.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const stopDragScroll = () => {
    dragPointerRef.current = null;
    if (dragScrollRafRef.current) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = 0;
    }
  };

  const clearReorderDrag = () => {
    dragPathRef.current = null;
    stopDragScroll();
    setDragPath(null);
    setDropHint(null);
  };

  useEffect(() => {
    if (!canReorder && !canMoveInto) clearReorderDrag();
  }, [canReorder, canMoveInto]);

  useEffect(
    () => () => {
      if (longPressRef.current?.timer) clearTimeout(longPressRef.current.timer);
    },
    [],
  );

  useEffect(() => {
    if (!dragPath) {
      stopDragScroll();
      return undefined;
    }

    const tick = () => {
      dragScrollRafRef.current = 0;
      const scroller = listScrollRef.current;
      const pointer = dragPointerRef.current;
      if (!scroller || !pointer || !dragPathRef.current) return;
      const rect = scroller.getBoundingClientRect();
      if (isDragPointerOverListX(pointer.x, rect)) {
        const delta = dragAutoScrollDelta(pointer.y, scroller);
        if (delta) scroller.scrollTop += delta;
      }
      dragScrollRafRef.current = requestAnimationFrame(tick);
    };

    const onDragOver = (event) => {
      if (!dragPathRef.current || isExternalFileDrag(event)) return;
      const scroller = listScrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      if (!isDragPointerOverListX(event.clientX, rect)) return;
      dragPointerRef.current = { x: event.clientX, y: event.clientY };
      if (
        event.clientY >= rect.top - DRAG_SCROLL_ABOVE_PX &&
        event.clientY <= rect.bottom &&
        event.cancelable
      ) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      }
      if (!dragScrollRafRef.current) {
        dragScrollRafRef.current = requestAnimationFrame(tick);
      }
    };

    document.addEventListener('dragover', onDragOver);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      stopDragScroll();
    };
  }, [dragPath]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
        불러오는 중…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <button
        type="button"
        className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-nas-muted"
        onClick={onBackgroundClick}
      >
        <p>폴더가 비어 있습니다.</p>
        <p className="text-xs">업로드, 새 폴더/파일, 붙여넣기, 또는 파일을 끌어다 놓으세요.</p>
      </button>
    );
  }

  return (
    <div
      ref={listScrollRef}
      className="min-h-0 flex-1 overflow-y-auto outline-none"
      data-explorer-list="true"
      tabIndex={0}
      onClick={(event) => {
        if (event.currentTarget === event.target) onBackgroundClick();
      }}
      onDragOver={(event) => {
        if (!dragPathRef.current || isExternalFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        dragPointerRef.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <table className="w-full table-fixed text-left text-[10pt] [&_td]:align-middle [&_th]:align-middle">
        <thead className="sticky top-0 bg-slate-50 text-[10pt] uppercase tracking-wide text-nas-muted">
          <tr>
            <th className="w-8 px-1 py-2">
              <div className="flex min-h-7 items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  aria-label="전체 선택"
                  className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
                />
              </div>
            </th>
            <SortableHeader
              label="이름"
              column="name"
              sortField={sortField}
              sortDirection={sortDirection}
              className="pl-1 pr-4 py-2"
              onSort={onSort}
              levelsCollapsed={levelsCollapsed}
              canToggleLevels={canToggleLevels}
              onToggleLevels={onToggleLevels}
              extra={
                <div className="inline-flex items-center gap-1">
                  {canReorder && onMoveOrderUp && onMoveOrderDown ? (
                    <HeaderButtonGroup>
                      <HeaderIconButton
                        disabled={!canMoveOrderUp}
                        onClick={onMoveOrderUp}
                        title="선택한 항목을 한 칸 위로"
                      >
                        <IconMoveUp />
                      </HeaderIconButton>
                      <HeaderButtonDivider />
                      <HeaderIconButton
                        disabled={!canMoveOrderDown}
                        onClick={onMoveOrderDown}
                        title="선택한 항목을 한 칸 아래로"
                      >
                        <IconMoveDown />
                      </HeaderIconButton>
                    </HeaderButtonGroup>
                  ) : null}
                  {canIndent && onIndentUp && onIndentDown ? (
                    <HeaderButtonGroup>
                      <HeaderIconButton
                        disabled={!canIndentUp}
                        onClick={onIndentUp}
                        title="한 단계 올리기"
                      >
                        <IconIndentLeft />
                      </HeaderIconButton>
                      <HeaderButtonDivider />
                      <HeaderIconButton
                        disabled={!canIndentDown}
                        onClick={onIndentDown}
                        title="한 단계 내리기"
                      >
                        <IconIndentRight />
                      </HeaderIconButton>
                    </HeaderButtonGroup>
                  ) : null}
                </div>
              }
            />
            <th
              className="px-1 py-2 font-medium"
              style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}
            >
              상태
            </th>
            <SortableHeader
              label="수정일"
              column="modifiedAt"
              sortField={sortField}
              sortDirection={sortDirection}
              className={MODIFIED_DATE_COLUMN_CLASS}
              onSort={onSort}
            />
            <SortableHeader
              label="크기"
              column="size"
              sortField={sortField}
              sortDirection={sortDirection}
              className="hidden w-24 px-4 py-2 sm:table-cell"
              onSort={onSort}
            />
            <SortableHeader
              label="종류"
              column="type"
              sortField={sortField}
              sortDirection={sortDirection}
              className={TYPE_COLUMN_CLASS}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const selected = selectedSet.has(entry.relativePath);
            const modifiedLabel = formatModifiedDateLine(entry.modifiedAt);
            const locationLabel = showFavoriteLocation
              ? favoriteAncestorLabel(entry.relativePath, {
                  includeSelf: true,
                  isDirectory: entry.isDirectory,
                  externalFolders,
                })
              : '';
            const reorderable =
              !touchUi &&
              canReorder &&
              !(lockFixedOrder && isFixedFolderOrderPath(entry.relativePath));
            const draggable =
              !touchUi &&
              (reorderable || canMoveInto) &&
              !isWorkspaceRootSystemFolder(entry.relativePath);
            const dragging = dragPath === entry.relativePath;
            const hintHere = dropHint?.path === entry.relativePath;
            const indent = fileIndentInfo[entry.relativePath];
            const indentLevel = entry.isDirectory ? 0 : indent?.level || 0;
            const hasChildren = Boolean(indent?.hasChildren);
            const collapsed = Boolean(indent?.collapsed);

            return (
              <tr
                key={entry.relativePath}
                data-explorer-entry={entry.relativePath}
                draggable={draggable}
                className={`border-t border-nas-border ${
                  draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } ${selected ? 'bg-nas-accentSoft' : 'hover:bg-slate-50'} ${
                  dragging ? 'opacity-50' : ''
                }`}
                style={
                  hintHere && dropHint.place === 'into'
                    ? { boxShadow: 'inset 0 0 0 2px rgb(var(--nas-accent))' }
                    : hintHere
                      ? {
                          boxShadow:
                            dropHint.place === 'before'
                              ? 'inset 0 2px 0 0 rgb(var(--nas-accent))'
                              : 'inset 0 -2px 0 0 rgb(var(--nas-accent))',
                        }
                      : undefined
                }
                onClick={(event) => {
                  if (longPressOpenedRef.current) {
                    longPressOpenedRef.current = false;
                    return;
                  }
                  event.currentTarget.closest('[data-explorer-list]')?.focus({ preventScroll: true });
                  const now = Date.now();
                  listClicksRef.current = listClicksRef.current
                    .filter((item) => now - item.time < 700)
                    .concat({ path: entry.relativePath, time: now });
                  onSelect(entry, event);
                }}
                onDoubleClick={() => {
                  if (touchUi) return;
                  const recent = listClicksRef.current.slice(-2);
                  if (
                    recent.length >= 2 &&
                    (recent[0].path !== recent[1].path || recent[1].path !== entry.relativePath)
                  ) {
                    return;
                  }
                  onOpen(entry);
                }}
                onContextMenu={(event) => onContextMenu(event, entry)}
                onPointerDown={(event) => {
                  if (!touchUi || event.pointerType === 'mouse' || event.button !== 0) return;
                  if (longPressRef.current?.timer) clearTimeout(longPressRef.current.timer);
                  const { clientX, clientY } = event;
                  longPressRef.current = {
                    x: clientX,
                    y: clientY,
                    timer: setTimeout(() => {
                      longPressRef.current = null;
                      longPressOpenedRef.current = true;
                      onContextMenu(
                        {
                          clientX,
                          clientY,
                          preventDefault() {},
                          stopPropagation() {},
                        },
                        entry,
                      );
                    }, 480),
                  };
                }}
                onPointerMove={(event) => {
                  const hold = longPressRef.current;
                  if (!hold) return;
                  if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) < 10) return;
                  clearTimeout(hold.timer);
                  longPressRef.current = null;
                }}
                onPointerUp={() => {
                  if (!longPressRef.current) return;
                  clearTimeout(longPressRef.current.timer);
                  longPressRef.current = null;
                }}
                onPointerCancel={() => {
                  if (!longPressRef.current) return;
                  clearTimeout(longPressRef.current.timer);
                  longPressRef.current = null;
                }}
                onDragStart={(event) => {
                  if (!draggable || isExternalFileDrag(event)) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(REORDER_MIME, entry.relativePath);
                  event.dataTransfer.setData('text/plain', entry.relativePath);
                  dragPathRef.current = entry.relativePath;
                  setDragPath(entry.relativePath);
                }}
                onDragEnd={clearReorderDrag}
                onDragOver={(event) => {
                  const sourcePath = dragPathRef.current;
                  if (isExternalFileDrag(event) || !sourcePath) return;
                  const source = entries.find((item) => item.relativePath === sourcePath);
                  const drop = resolveInternalDrop(source, entry, event, null);
                  const allow =
                    drop &&
                    ((drop.kind === 'into' && canMoveInto) ||
                      (drop.kind === 'reorder' && canReorder && reorderable));
                  if (!allow) {
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
                    if (dropHint) setDropHint(null);
                    return;
                  }
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                  const place = drop.kind === 'into' ? 'into' : drop.place;
                  if (dropHint?.path !== entry.relativePath || dropHint.place !== place) {
                    setDropHint({ path: entry.relativePath, place });
                  }
                }}
                onDragLeave={(event) => {
                  const related = event.relatedTarget;
                  if (related instanceof Node && event.currentTarget.contains(related)) return;
                  if (dropHint?.path === entry.relativePath) setDropHint(null);
                }}
                onDrop={(event) => {
                  const sourcePath = dragPathRef.current;
                  if (isExternalFileDrag(event) || !sourcePath) return;
                  const source = entries.find((item) => item.relativePath === sourcePath);
                  const drop = resolveInternalDrop(source, entry, event, dropHint);
                  clearReorderDrag();
                  if (!drop) return;
                  event.preventDefault();
                  if (drop.kind === 'into') {
                    if (!canMoveInto || !source) return;
                    onMoveInto?.(source, entry);
                    return;
                  }
                  if (!canReorder || !reorderable || !source) return;
                  onReorder?.(source, entry, drop.place);
                }}
              >
                <td
                  className="w-8 px-1 py-2"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleCheckbox(entry)}
                      aria-label={`${entry.name} 선택`}
                      className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
                    />
                  </div>
                </td>
                <td className="max-w-0 py-2 pl-1 pr-4">
                  <div
                    className="flex min-w-0 items-center gap-2 overflow-hidden"
                    style={indentLevel > 0 ? { paddingLeft: `${indentLevel * FILE_INDENT_STEP_PX}px` } : undefined}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className={`${COLLAPSE_SLOT_CLASS} rounded-md text-slate-600 hover:bg-slate-200`}
                        title={collapsed ? '하위 파일 펼치기' : '하위 파일 접기'}
                        aria-label={collapsed ? '하위 파일 펼치기' : '하위 파일 접기'}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleCollapse?.(entry);
                        }}
                      >
                        <IndentChevron expanded={!collapsed} />
                      </button>
                    ) : (
                      <span className={COLLAPSE_SLOT_CLASS} aria-hidden="true" />
                    )}
                    {isWorkspaceRootSystemFolder(entry.relativePath) ? (
                      <EntryMenuButton
                        label={entry.name}
                        onOpen={(event) => onContextMenu(event, entry)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200"
                      >
                        <BoxedDotsIcon className="h-4 w-4" />
                      </EntryMenuButton>
                    ) : (
                      <EntryMenuButton
                        label={entry.name}
                        onOpen={(event) => onContextMenu(event, entry)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-slate-200"
                      >
                        <FileIcon
                          entry={entry}
                          folderColor={folderColorMap[entry.relativePath]}
                          nameBold={Boolean(nameBoldMap[entry.relativePath])}
                          className="h-5 w-5"
                        />
                      </EntryMenuButton>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-slate-700 ${
                          isWorkspaceRootSystemFolder(entry.relativePath) ||
                          nameBoldMap[entry.relativePath]
                            ? 'font-bold'
                            : 'font-medium'
                        }`}
                        title={entry.name}
                      >
                        {entry.name}
                      </span>
                      {locationLabel ? (
                        <span
                          className="block truncate text-[11px] leading-tight text-nas-muted"
                          title={locationLabel}
                        >
                          {locationLabel}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-2" style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}>
                  <FileEntryStatusBadges
                    entry={entry}
                    accessMap={accessMap}
                    shareMap={shareMap}
                    favoritesMap={favoritesMap}
                    onShareLinkClick={onShareLinkClick}
                    onPropertiesClick={onPropertiesClick}
                  />
                </td>
                <td className={`text-nas-muted ${MODIFIED_DATE_COLUMN_CLASS}`} title={modifiedLabel}>
                  {modifiedLabel}
                </td>
                <td className="hidden px-4 py-2 text-nas-muted sm:table-cell">
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </td>
                <td
                  className={`${TYPE_COLUMN_CLASS} ${
                    entry.isDirectory
                      ? 'text-nas-muted'
                      : fileTypeColorClass(entryExtensionOf(entry) || entry.extension)
                  }`}
                >
                  {entry.isDirectory
                    ? '폴더'
                    : `${(entryExtensionOf(entry) || entry.extension || '파일').toUpperCase()}${
                        isSecFileName(entry.name || entry.relativePath) ? ' · 잠금' : ''
                      }`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
