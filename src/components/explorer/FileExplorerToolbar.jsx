export default function FileExplorerToolbar({
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
  onDownloadClick,
  canDownload = false,
  onCopy,
  onCut,
  onMove,
  onPaste,
  onDelete,
  onRename,
  onSelectAll,
  onClearSelection,
  onProperties,
  canShowProperties = false,
  isInTrashView = false,
  onEmptyTrash,
  onRestore,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-nas-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className="nas-btn-ghost" onClick={onNavigateUp} title="상위 폴더">
          상위
        </button>
        <button type="button" className="nas-btn-ghost" onClick={onRefresh} title="F5">
          새로고침
        </button>
        <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
        {!isInTrashView && (
          <>
            <button type="button" className="nas-btn-ghost" onClick={onCreateFolder}>
              새 폴더
            </button>
            <button type="button" className="nas-btn-ghost" onClick={onCreateFile}>
              새 파일
            </button>
            <button type="button" className="nas-btn-ghost" onClick={onUploadClick}>
              업로드
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!canDownload} onClick={onDownloadClick}>
              다운로드
            </button>
            <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
            <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onCopy}>
              복사
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onCut}>
              잘라내기
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onMove}>
              이동
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!hasClipboard} onClick={onPaste}>
              붙여넣기
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!hasSelection} onClick={onRename}>
              이름 변경
            </button>
          </>
        )}
        {isInTrashView && (
          <>
            <button
              type="button"
              className="nas-btn-ghost font-medium text-nas-accent"
              disabled={!hasSelection}
              onClick={onRestore}
            >
              복원
            </button>
            <button type="button" className="nas-btn-ghost text-red-600" onClick={onEmptyTrash}>
              휴지통 비우기
            </button>
          </>
        )}
        <button type="button" className="nas-btn-ghost text-red-600" disabled={!hasSelection} onClick={onDelete}>
          {isInTrashView ? '영구 삭제' : '휴지통으로'}
        </button>
        <button type="button" className="nas-btn-ghost hidden md:inline-flex" onClick={onSelectAll}>
          전체 선택
        </button>
        <button
          type="button"
          className="nas-btn-ghost hidden md:inline-flex"
          disabled={!hasSelection}
          onClick={onClearSelection}
        >
          선택 해제
        </button>
        <button
          type="button"
          className="nas-btn-ghost hidden md:inline-flex"
          disabled={!canShowProperties}
          onClick={onProperties}
        >
          속성
        </button>
        <span className="mx-1 hidden h-4 w-px bg-nas-border lg:inline" />
        <select
          value={sortField}
          onChange={(event) => onSortFieldChange(event.target.value)}
          className="hidden h-8 rounded-md border border-nas-border bg-white px-2 text-[10pt] lg:inline"
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
            className={`rounded px-2 py-1 text-[10pt] ${viewMode === 'list' ? 'bg-slate-100 font-medium' : ''}`}
            onClick={() => onViewModeChange('list')}
          >
            목록
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-[10pt] ${viewMode === 'grid' ? 'bg-slate-100 font-medium' : ''}`}
            onClick={() => onViewModeChange('grid')}
          >
            아이콘
          </button>
        </div>
      </div>
    </div>
  );
}
