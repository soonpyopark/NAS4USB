import { useEffect, useRef } from 'react';
import FileIcon from './FileIcon.jsx';
import FileEntryStatusBadges, { FILE_STATUS_SLOT_WIDTH } from './FileEntryStatusBadges.jsx';

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

const MODIFIED_DATE_COLUMN_CLASS = 'hidden w-44 min-w-[9.5rem] whitespace-nowrap px-2 py-2 md:table-cell';

export default function FileList({
  entries,
  loading,
  viewMode,
  selectedSet,
  accessMap = {},
  shareMap = {},
  favoritesMap = {},
  onOpen,
  onSelect,
  onToggleCheckbox,
  onToggleSelectAll,
  onContextMenu,
  onBackgroundClick,
  onShareLinkClick,
  onPropertiesClick,
}) {
  const selectAllRef = useRef(null);
  const selectedVisibleCount = entries.filter((entry) => selectedSet.has(entry.relativePath)).length;
  const allVisibleSelected = entries.length > 0 && selectedVisibleCount === entries.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

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

  if (viewMode === 'grid') {
    return (
      <div
        className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 overflow-y-auto p-4"
        onClick={(event) => {
          if (event.currentTarget === event.target) onBackgroundClick();
        }}
      >
        {entries.map((entry) => {
          const selected = selectedSet.has(entry.relativePath);

          return (
            <button
              key={entry.relativePath}
              type="button"
              className={`group relative flex min-w-0 flex-col items-center gap-2 overflow-hidden rounded-lg border p-3 text-center transition-colors ${
                selected
                  ? 'border-nas-accent bg-blue-50'
                  : 'border-transparent hover:border-nas-border hover:bg-slate-50'
              }`}
              onClick={(event) => onSelect(entry, event)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(event) => onContextMenu(event, entry)}
            >
              <label
                className="absolute left-2 top-2 z-10"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleCheckbox(entry)}
                  aria-label={`${entry.name} 선택`}
                  className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
                />
              </label>
              <div
                className="mt-5 flex justify-center"
                style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}
              >
                <FileEntryStatusBadges
                  entry={entry}
                  accessMap={accessMap}
                  shareMap={shareMap}
                  favoritesMap={favoritesMap}
                  onShareLinkClick={onShareLinkClick}
                  onPropertiesClick={onPropertiesClick}
                />
              </div>
              <FileIcon entry={entry} className="h-12 w-12" />
              <span className="w-full truncate text-[10pt] text-slate-700" title={entry.name}>
                {entry.name}
              </span>
            </button>
          );
        })}
      </div>
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
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleSelectAll}
                aria-label="전체 선택"
                className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
              />
            </th>
            <th
              className="px-1 py-2 font-medium"
              style={{ width: `${FILE_STATUS_SLOT_WIDTH}px` }}
            >
              상태
            </th>
            <th className="px-4 py-2 font-medium">이름</th>
            <th className={`font-medium ${MODIFIED_DATE_COLUMN_CLASS}`}>수정일</th>
            <th className="hidden w-24 px-4 py-2 font-medium sm:table-cell">크기</th>
            <th className="hidden w-20 px-4 py-2 font-medium lg:table-cell">종류</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const selected = selectedSet.has(entry.relativePath);
            const modifiedLabel = formatModifiedDateLine(entry.modifiedAt);

            return (
              <tr
                key={entry.relativePath}
                className={`cursor-pointer border-t border-nas-border ${
                  selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
                onClick={(event) => onSelect(entry, event)}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(event) => onContextMenu(event, entry)}
              >
                <td
                  className="w-10 px-2 py-2"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleCheckbox(entry)}
                    aria-label={`${entry.name} 선택`}
                    className="h-4 w-4 rounded border-slate-300 text-nas-accent focus:ring-nas-accent"
                  />
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
                <td className="max-w-0 px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <FileIcon entry={entry} className="h-5 w-5 shrink-0" />
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-slate-700"
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                  </div>
                </td>
                <td className={`text-nas-muted ${MODIFIED_DATE_COLUMN_CLASS}`} title={modifiedLabel}>
                  {modifiedLabel}
                </td>
                <td className="hidden px-4 py-2 text-nas-muted sm:table-cell">
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </td>
                <td className="hidden px-4 py-2 text-nas-muted lg:table-cell">
                  {entry.isDirectory ? '폴더' : entry.extension?.toUpperCase() || '파일'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
