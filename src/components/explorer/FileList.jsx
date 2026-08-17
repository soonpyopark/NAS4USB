import { useEffect, useRef, useState } from 'react';
import { EXTERNAL_FOLDER, SHARED_FOLDER } from '../../../shared/constants.js';
import { HOMES_FOLDER } from '../../../shared/memberHomes.js';
import { isFixedFolderOrderPath } from '../../../shared/folderOrder.js';
import { displayEntryName } from '../../lib/fsPaths.js';
import { favoriteAncestorLabel } from '../../lib/favoritesPaths.js';
import { entryExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import EntryMenuButton, { BoxedDotsIcon } from './EntryMenuButton.jsx';
import FileIcon, { fileTypeColorClass } from './FileIcon.jsx';
import FileEntryStatusBadges, { FILE_STATUS_SLOT_WIDTH } from './FileEntryStatusBadges.jsx';

const REORDER_MIME = 'application/x-nas4usb-reorder';

function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function dropPlaceFromEvent(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
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
  sortField = 'custom',
  sortDirection = 'asc',
  onSort,
  canMoveOrderUp = false,
  canMoveOrderDown = false,
  onMoveOrderUp,
  onMoveOrderDown,
  showFavoriteLocation = false,
  lockFixedOrder = true,
}) {
  const selectAllRef = useRef(null);
  const dragPathRef = useRef(/** @type {string | null} */ (null));
  const [dragPath, setDragPath] = useState(/** @type {string | null} */ (null));
  const [dropHint, setDropHint] = useState(
    /** @type {{ path: string, place: 'before' | 'after' } | null} */ (null),
  );
  const selectedVisibleCount = entries.filter((entry) => selectedSet.has(entry.relativePath)).length;
  const allVisibleSelected = entries.length > 0 && selectedVisibleCount === entries.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const clearReorderDrag = () => {
    dragPathRef.current = null;
    setDragPath(null);
    setDropHint(null);
  };

  useEffect(() => {
    if (!canReorder) clearReorderDrag();
  }, [canReorder]);

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
      className="min-h-0 flex-1 overflow-y-auto"
      onClick={(event) => {
        if (event.currentTarget === event.target) onBackgroundClick();
      }}
    >
      <table className="w-full table-fixed text-left text-[10pt] [&_td]:align-middle [&_th]:align-middle">
        <thead className="sticky top-0 bg-slate-50 text-[10pt] uppercase tracking-wide text-nas-muted">
          <tr>
            <th className="w-10 px-2 py-2">
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
              className="px-4 py-2"
              onSort={onSort}
              extra={
                canReorder && onMoveOrderUp && onMoveOrderDown ? (
                  <div className="inline-flex items-center rounded-md border border-nas-border bg-white normal-case tracking-normal">
                    <button
                      type="button"
                      className="inline-flex h-6 items-center px-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canMoveOrderUp}
                      onClick={onMoveOrderUp}
                      title="선택한 항목을 한 칸 위로"
                      aria-label="위로"
                    >
                      <IconMoveUp />
                    </button>
                    <span className="h-3.5 w-px bg-nas-border" aria-hidden="true" />
                    <button
                      type="button"
                      className="inline-flex h-6 items-center px-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canMoveOrderDown}
                      onClick={onMoveOrderDown}
                      title="선택한 항목을 한 칸 아래로"
                      aria-label="아래로"
                    >
                      <IconMoveDown />
                    </button>
                  </div>
                ) : null
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
                })
              : '';
            const reorderable =
              canReorder && !(lockFixedOrder && isFixedFolderOrderPath(entry.relativePath));
            const dragging = dragPath === entry.relativePath;
            const hintHere = dropHint?.path === entry.relativePath;

            return (
              <tr
                key={entry.relativePath}
                data-explorer-entry={entry.relativePath}
                draggable={reorderable}
                className={`border-t border-nas-border ${
                  reorderable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } ${selected ? 'bg-nas-accentSoft' : 'hover:bg-slate-50'} ${
                  dragging ? 'opacity-50' : ''
                }`}
                style={
                  hintHere
                    ? {
                        boxShadow:
                          dropHint.place === 'before'
                            ? 'inset 0 2px 0 0 rgb(var(--nas-accent))'
                            : 'inset 0 -2px 0 0 rgb(var(--nas-accent))',
                      }
                    : undefined
                }
                onClick={(event) => onSelect(entry, event)}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(event) => onContextMenu(event, entry)}
                onDragStart={(event) => {
                  if (!reorderable || isExternalFileDrag(event)) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(REORDER_MIME, entry.relativePath);
                  event.dataTransfer.setData('text/plain', entry.relativePath);
                  dragPathRef.current = entry.relativePath;
                  setDragPath(entry.relativePath);
                }}
                onDragEnd={clearReorderDrag}
                onDragOver={(event) => {
                  const sourcePath = dragPathRef.current;
                  if (!canReorder || isExternalFileDrag(event) || !sourcePath) return;
                  if (!reorderable || sourcePath === entry.relativePath) {
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
                    if (dropHint) setDropHint(null);
                    return;
                  }
                  const source = entries.find((item) => item.relativePath === sourcePath);
                  if (!source || source.isDirectory !== entry.isDirectory) {
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
                    if (dropHint) setDropHint(null);
                    return;
                  }
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                  const place = dropPlaceFromEvent(event);
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
                  if (!canReorder || isExternalFileDrag(event) || !sourcePath) return;
                  event.preventDefault();
                  const source = entries.find((item) => item.relativePath === sourcePath);
                  const place = dropHint?.path === entry.relativePath
                    ? dropHint.place
                    : dropPlaceFromEvent(event);
                  clearReorderDrag();
                  if (!source || !reorderable) return;
                  onReorder?.(source, entry, place);
                }}
              >
                <td
                  className="w-10 px-2 py-2"
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
                <td className="max-w-0 px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    {isWorkspaceRootSystemFolder(entry.relativePath) ? (
                      <EntryMenuButton
                        label={displayEntryName(entry)}
                        onOpen={(event) => onContextMenu(event, entry)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200"
                      >
                        <BoxedDotsIcon className="h-4 w-4" />
                      </EntryMenuButton>
                    ) : (
                      <EntryMenuButton
                        label={displayEntryName(entry)}
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
                        {displayEntryName(entry)}
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
