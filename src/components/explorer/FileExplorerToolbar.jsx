export default function FileExplorerToolbar({
  searchQuery,
  onSearchChange,
  sortField,
  sortDirection,
  onSortFieldChange,
  onToggleSortDirection,
  viewMode,
  onViewModeChange,
  hasSelection,
  hasClipboard,
  onNavigateUp,
  onRefresh,
  onCreateFolder,
  onCreateFile,
  onUploadClick,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onRename,
  onSelectAll,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-nas-border px-4 py-3">
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="검색…"
        className="h-8 w-full min-w-[120px] max-w-[220px] rounded-md border border-nas-border px-3 text-sm outline-none focus:border-nas-accent focus:ring-1 focus:ring-nas-accent"
      />

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="nas-btn-ghost" onClick={onNavigateUp} title="상위 폴더">
          상위
        </button>
        <button type="button" className="nas-btn-ghost" onClick={onRefresh} title="F5">
          새로고침
        </button>
        <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
        <button type="button" className="nas-btn-ghost" onClick={onCreateFolder}>
          새 폴더
        </button>
        <button type="button" className="nas-btn-ghost" onClick={onCreateFile}>
          새 파일
        </button>
        <button type="button" className="nas-btn-ghost" onClick={onUploadClick}>
          업로드
        </button>
        <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
        <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onCopy}>
          복사
        </button>
        <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onCut}>
          잘라내기
        </button>
        <button type="button" className="nas-btn-ghost" disabled={!hasClipboard} onClick={onPaste}>
          붙여넣기
        </button>
        <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onRename}>
          이름 변경
        </button>
        <button type="button" className="nas-btn-ghost text-red-600" disabled={!hasSelection} onClick={onDelete}>
          삭제
        </button>
        <button type="button" className="nas-btn-ghost hidden md:inline-flex" onClick={onSelectAll}>
          전체 선택
        </button>
        <span className="mx-1 hidden h-4 w-px bg-nas-border lg:inline" />
        <select
          value={sortField}
          onChange={(event) => onSortFieldChange(event.target.value)}
          className="hidden h-8 rounded-md border border-nas-border bg-white px-2 text-xs lg:inline"
        >
          <option value="name">이름</option>
          <option value="modifiedAt">수정일</option>
          <option value="size">크기</option>
          <option value="type">종류</option>
        </select>
        <button type="button" className="nas-btn-ghost hidden px-2 lg:inline-flex" onClick={onToggleSortDirection}>
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
        <div className="flex rounded-md border border-nas-border p-0.5">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${viewMode === 'list' ? 'bg-slate-100 font-medium' : ''}`}
            onClick={() => onViewModeChange('list')}
          >
            목록
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${viewMode === 'grid' ? 'bg-slate-100 font-medium' : ''}`}
            onClick={() => onViewModeChange('grid')}
          >
            아이콘
          </button>
        </div>
      </div>
    </div>
  );
}
