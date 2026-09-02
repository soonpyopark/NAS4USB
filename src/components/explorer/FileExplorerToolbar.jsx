import { useState } from 'react';
import { useTouchUi } from '../../hooks/useTouchUi.js';
import ContextMenu from './ContextMenu.jsx';

export default function FileExplorerToolbar({
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
  onClearExternalCaches,
  clearingExternalCaches = false,
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
  const touchUi = useTouchUi();
  const [moreMenu, setMoreMenu] = useState(/** @type {null | { x: number, y: number }} */ (null));
  const showWriteActions = canWrite && !isInTrashView && !isInFavoritesView;
  const showTrashAdminActions = canWrite && isInTrashView;
  const showDeleteAction =
    (showWriteActions || showTrashAdminActions) && !isInFavoritesView;

  const overflowItems = [];
  if (showWriteActions) {
    overflowItems.push(
      { id: 'download', label: '다운로드', disabled: !canDownload, onClick: onDownloadClick },
      { id: 'rename', label: '이름 변경', disabled: !canRename, onClick: onRename },
      { id: 'copy', label: '복사', disabled: !hasSelection, onClick: onCopy },
      { id: 'cut', label: '잘라내기', disabled: !hasSelection, onClick: onCut },
      { id: 'move', label: '이동', disabled: !hasSelection, onClick: onMove },
      { id: 'paste', label: '붙여넣기', disabled: !hasClipboard, onClick: onPaste },
      { id: 'duplicate', label: '복제', disabled: !canRename, onClick: onDuplicate },
    );
  }
  if (hasSelection && showTrashAdminActions) {
    overflowItems.push({
      id: 'restore',
      label: '복원',
      onClick: onRestore,
    });
  }
  if (hasSelection && showDeleteAction && showTrashDelete && !isInTrashView) {
    overflowItems.push({
      id: 'delete',
      label: '삭제',
      danger: true,
      onClick: onDelete,
    });
  }
  if (showDeleteAction) {
    overflowItems.push({
      id: 'delete-permanent',
      label: '삭제(영구)',
      danger: true,
      disabled: !hasSelection,
      onClick: onPermanentDelete ?? onDelete,
    });
  }
  if (showTrashAdminActions && canEmptyTrash) {
    overflowItems.push({
      id: 'empty-trash',
      label: '휴지통 비우기',
      danger: true,
      onClick: onEmptyTrash,
    });
  }
  overflowItems.push({
    id: 'properties',
    label: '속성',
    disabled: !canShowProperties,
    onClick: onProperties,
  });
  if (showWriteActions && onImportOnenote) {
    overflowItems.push({
      id: 'onenote',
      label: importingOnenote ? '가져오는 중…' : '원노트 가져오기',
      disabled: importingOnenote,
      onClick: onImportOnenote,
    });
  }
  if (onClearExternalCaches) {
    overflowItems.push({
      id: 'clear-external-caches',
      label: clearingExternalCaches ? '정리 중…' : '캐시 정리',
      danger: true,
      disabled: clearingExternalCaches,
      onClick: onClearExternalCaches,
    });
  }
  if (showWriteActions && onClearFolderBackups) {
    overflowItems.push({
      id: 'clear-backups',
      label: clearingFolderBackups ? '제거 중…' : '백업 일괄 제거',
      danger: true,
      disabled: clearingFolderBackups,
      onClick: onClearFolderBackups,
    });
  }

  if (touchUi) {
    return (
      <div className="file-explorer-toolbar file-explorer-toolbar--touch">
        <button type="button" className="nas-btn-ghost" onClick={onRefresh} title="F5">
          새로고침
        </button>
        {showWriteActions ? (
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
          </>
        ) : null}
        <button
          type="button"
          data-menu-trigger="more"
          className={`nas-btn-ghost file-explorer-toolbar__more${moreMenu ? ' is-open' : ''}`}
          title="더보기"
          aria-label="더보기"
          aria-haspopup="menu"
          aria-expanded={Boolean(moreMenu)}
          onClick={(event) => {
            if (moreMenu) {
              setMoreMenu(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setMoreMenu({ x: rect.right, y: rect.bottom + 4 });
          }}
        >
          ⋯
        </button>
        {moreMenu ? (
          <ContextMenu
            x={moreMenu.x}
            y={moreMenu.y}
            items={overflowItems}
            onClose={() => setMoreMenu(null)}
          />
        ) : null}
      </div>
    );
  }

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
        {onClearExternalCaches && (
          <>
            <span className="mx-1 hidden h-4 w-px bg-nas-border sm:inline" />
            <button
              type="button"
              className="nas-btn-ghost text-red-600"
              disabled={clearingExternalCaches}
              onClick={onClearExternalCaches}
              title="원본이 없는 PDF 표시 캐시와 파일 이력만 삭제합니다. 폴더는 훑지 않습니다."
            >
              {clearingExternalCaches ? '정리 중…' : '캐시 정리'}
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
      </div>
    </div>
  );
}
