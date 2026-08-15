export default function FileExplorerToolbar({
  sortField,
  sortDirection,
  onSortFieldChange,
  onToggleSortDirection,
  hasSelection,
  canRename = false,
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
  onPermanentDelete,
  onRename,
  onDuplicate,
  onSelectAll,
  onClearSelection,
  onProperties,
  canShowProperties = false,
  onImportOnenote,
  importingOnenote = false,
  onClearFolderBackups,
  clearingFolderBackups = false,
  isInTrashView = false,
  isInFavoritesView = false,
  onEmptyTrash,
  onRestore,
  isAdminLoggedIn = true,
  canWrite = true,
  canEmptyTrash = true,
  showTrashDelete = true,
}) {
  const showWriteActions = canWrite && !isInTrashView && !isInFavoritesView;
  const showTrashAdminActions = canWrite && isInTrashView;
  const showDeleteAction =
    (showWriteActions || showTrashAdminActions) && !isInFavoritesView;

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
        {showWriteActions && (
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
            <button type="button" className="nas-btn-ghost" disabled={!canRename} onClick={onRename}>
              이름 변경
            </button>
            <button type="button" className="nas-btn-ghost" disabled={!canRename} onClick={onDuplicate}>
              복제
            </button>
          </>
        )}
        {showTrashAdminActions && (
          <>
            <button
              type="button"
              className="nas-btn-ghost font-medium text-nas-accent"
              disabled={!hasSelection}
              onClick={onRestore}
            >
              복원
            </button>
            {canEmptyTrash && (
              <button type="button" className="nas-btn-ghost text-red-600" onClick={onEmptyTrash}>
                휴지통 비우기
              </button>
            )}
          </>
        )}
        {showDeleteAction && showTrashDelete && !isInTrashView && (
          <button type="button" className="nas-btn-ghost text-red-600" disabled={!hasSelection} onClick={onDelete}>
            삭제(휴지통)
          </button>
        )}
        {showDeleteAction && (
          <button
            type="button"
            className="nas-btn-ghost text-red-600"
            disabled={!hasSelection}
            onClick={onPermanentDelete ?? onDelete}
          >
            삭제(영구)
          </button>
        )}
        <button type="button" className="nas-btn-ghost" onClick={onSelectAll}>
          전체 선택
        </button>
        <button
          type="button"
          className="nas-btn-ghost"
          disabled={!hasSelection}
          onClick={onClearSelection}
        >
          선택 해제
        </button>
        <button
          type="button"
          className="nas-btn-ghost"
          disabled={!canShowProperties}
          onClick={onProperties}
        >
          속성
        </button>
        {showWriteActions && onImportOnenote && (
          <>
            <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
            <button
              type="button"
              className="nas-btn-ghost"
              disabled={importingOnenote}
              onClick={onImportOnenote}
              title="원노트(.one/.onepkg) 파일을 현재 폴더에 폴더+TipTap 페이지로 가져옵니다"
            >
              {importingOnenote ? '가져오는 중…' : '원노트 가져오기'}
            </button>
          </>
        )}
        {showWriteActions && onClearFolderBackups && (
          <button
            type="button"
            className="nas-btn-ghost text-red-600"
            disabled={clearingFolderBackups}
            onClick={onClearFolderBackups}
            title="이 폴더와 하위 폴더·파일의 백업(이력)을 모두 제거합니다. 원본 파일은 그대로 둡니다."
          >
            {clearingFolderBackups ? '제거 중…' : '백업 일괄 제거'}
          </button>
        )}
        <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
        <select
          value={sortField}
          onChange={(event) => onSortFieldChange(event.target.value)}
          className="h-8 rounded-md border border-nas-border bg-white px-2 text-[10pt]"
        >
          <option value="name">이름</option>
          <option value="modifiedAt">수정일</option>
          <option value="size">크기</option>
          <option value="type">종류</option>
        </select>
        <button type="button" className="nas-btn-ghost px-2" onClick={onToggleSortDirection}>
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  );
}
