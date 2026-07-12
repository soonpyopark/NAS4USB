import { useEffect, useRef, useState } from 'react';
import ContextMenu from '../explorer/ContextMenu.jsx';
import FilePropertiesDialog from '../explorer/FilePropertiesDialog.jsx';
import NewFileDialog from '../explorer/NewFileDialog.jsx';
import NewFolderDialog from '../explorer/NewFolderDialog.jsx';
import RenameDialog from '../explorer/RenameDialog.jsx';
import ShareLinkModal from '../common/ShareLinkModal.jsx';
import MoveItemsDialog from '../explorer/MoveItemsDialog.jsx';
import DirectoryTree from './DirectoryTree.jsx';
import FileSearchResults from './FileSearchResults.jsx';
import SidebarToolbar from './SidebarToolbar.jsx';
import { useDirectoryTree } from '../../hooks/useDirectoryTree.js';
import { useFileSearch } from '../../hooks/useFileSearch.js';
import { useFileClipboard } from '../../hooks/useFileClipboard.js';
import { useFileSystem } from '../../hooks/useFileSystem.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { useShareLinks } from '../../hooks/useShareLinks.js';
import { useFileAccess } from '../../hooks/useFileAccess.js';
import { useFavorites } from '../../hooks/useFavorites.js';
import { useTrash } from '../../hooks/useTrash.js';
import { useFileDropZone } from '../../hooks/useFileDropZone.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import { useFsSync } from '../../context/FsSyncContext.jsx';
import { useFsRemoteRefresh } from '../../hooks/useFsRemoteRefresh.js';
import FileDropOverlay from '../common/FileDropOverlay.jsx';
import EditorUpdateButton from './EditorUpdateButton.jsx';
import {
  openShareLinkForEntry,
  revokeShareLinkForEntry,
} from '../../lib/shareLinkActions.js';
import {
  handleShareModeToggle,
  SHARE_LINK_MODE_EDIT,
  SHARE_LINK_MODE_VIEW,
} from '../../lib/shareProperties.js';
import {
  buildBackgroundContextMenuItems,
  buildEntryContextMenuItems,
} from '../../lib/fsContextMenu.js';
import {
  getParentPath,
  joinRelativePath,
  resolveUniqueName,
} from '../../lib/fsPaths.js';
import { resolveFileEntryStatus } from '../../lib/fileEntryStatus.js';
import { canOpenFileForEdit, VIEW_OPEN_DENIED_MESSAGE, GUEST_READ_DENIED_MESSAGE } from '../../lib/fileEditAccess.js';
import { useGuestPermissions } from '../../hooks/useGuestPermissions.js';
import { downloadFileEntries } from '../../lib/downloadEntries.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { TRASH_ACCESS_DENIED_MESSAGE } from '../../../shared/constants.js';
import { isTrashPath, isTrashSubfolder, TRASH_FOLDER } from '../../lib/trashPaths.js';
import { FAVORITES_FOLDER, isFavoritesPath } from '../../lib/favoritesPaths.js';
import { guardOpenFileEntry } from '../../lib/openFileGuard.js';
import { nativeAlert } from '../../lib/nativeDialog.js';
import {
  createFolderAtPath,
  createNewTypedFileAtPath,
  uploadFilesAtPath,
} from '../../lib/fsWriteActions.js';

export default function Sidebar({
  currentPath,
  mainView = 'explorer',
  onNavigate,
  onOpenSettings,
  onOpenFile,
  syncInfo,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const tree = useDirectoryTree(currentPath);
  const fs = useFileSystem(currentPath);
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();
  const { results: searchResults, searching, truncated, isActive: isSearchActive } = useFileSearch(
    searchQuery,
  );
  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();
  const { shareMap, refreshShareMap } = useShareLinks();
  const { accessMap, refreshAccessMap, setFileAccess } = useFileAccess();
  const { favoritesMap, favoritesCount, refreshFavoritesMap, setFavorite } = useFavorites();
  const { isAdminLoggedIn } = useAdminAuthContext();
  const { effectivePermissions } = useGuestPermissions();
  const canWrite = effectivePermissions.write;
  const { notifyLocalChange } = useFsSync();
  const { count: trashCount, refresh: refreshTrash } = useTrash({ enabled: canWrite });

  const isInTrashView = isTrashPath(currentPath);
  const isInFavoritesView = isFavoritesPath(currentPath);

  const [contextMenu, setContextMenu] = useState(null);
  const [propertiesEntry, setPropertiesEntry] = useState(null);
  const [propertiesStat, setPropertiesStat] = useState(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareLinkDialog, setShareLinkDialog] = useState(null);
  const [moveDialogEntries, setMoveDialogEntries] = useState(null);
  const [renameEntry, setRenameEntry] = useState(null);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState(null);

  const uploadInputRef = useRef(null);
  const dialogTargetPathRef = useRef('.');

  const refreshMaps = async () => {
    await refreshShareMap();
    await refreshAccessMap();
    await refreshFavoritesMap();
    await refreshTrash();
  };

  const notifyChange = async (paths) => {
    if (paths?.length) {
      await tree.refreshTree({ paths });
    } else {
      await tree.refreshTree();
    }
    await fs.refresh();
    await refreshMaps();
    notifyLocalChange('sidebar', paths?.length ? { paths } : {});
  };

  useFsRemoteRefresh('sidebar', {
    currentPath,
    getExpandedPaths: () => tree.expandedPaths,
    onRefresh: async (event) => {
      if (event.paths?.length) {
        await tree.refreshTree({ paths: event.paths });
      } else {
        await tree.refreshTree();
      }
      await fs.refresh();
      await refreshMaps();
    },
    onRefreshMeta: refreshMaps,
  });

  const openCreateFolderDialog = (targetPath = currentPath) => {
    if (isTrashPath(targetPath)) return;
    dialogTargetPathRef.current = targetPath;
    setNewFolderDialogOpen(true);
  };

  const handleCreateFolderConfirm = async (name) => {
    try {
      const targetPath = dialogTargetPathRef.current;
      await createFolderAtPath(targetPath, name);
      await tree.expandPath(targetPath);
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '폴더를 만들 수 없습니다.');
    }
  };

  const openCreateFileDialog = (targetPath = currentPath) => {
    if (isTrashPath(targetPath)) return;
    dialogTargetPathRef.current = targetPath;
    setNewFileDialogOpen(true);
  };

  const handleCreateTypedFile = async (type) => {
    setNewFileDialogOpen(false);
    try {
      const targetPath = dialogTargetPathRef.current;
      await createNewTypedFileAtPath(targetPath, type);
      await tree.expandPath(targetPath);
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '새 파일을 만들 수 없습니다.');
    }
  };

  const triggerUpload = (targetPath = currentPath) => {
    if (isTrashPath(targetPath)) return;
    dialogTargetPathRef.current = targetPath;
    uploadInputRef.current?.click();
  };

  const handleUploadFiles = async (files, targetPath = dialogTargetPathRef.current) => {
    try {
      await uploadFilesAtPath(targetPath, files);
      await tree.expandPath(targetPath);
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

  const { isFileDragOver, dropZoneProps } = useFileDropZone(
    (files) => handleUploadFiles(files, currentPath),
    { enabled: !isInTrashView && canWrite },
  );

  const handleDownload = async (entry = downloadTarget) => {
    const target = entry && !entry.isDirectory ? entry : downloadTarget;
    if (!target) {
      nativeAlert('다운로드할 파일을 선택해 주세요.');
      return;
    }

    try {
      await downloadFileEntries([target]);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    }
  };

  const getSiblingNames = async (targetPath) => {
    if (targetPath === currentPath) {
      return (tree.childrenMap[targetPath] ?? tree.rootEntries).map((entry) => entry.name);
    }

    const dirEntries = await window.nas4usb.fs.readDir(targetPath);
    return dirEntries.map((entry) => entry.name);
  };

  const handlePaste = async (targetPath = currentPath) => {
    try {
      const existingNames = await getSiblingNames(targetPath);
      const pasted = await pasteEntries(targetPath, existingNames);
      if (pasted) {
        if (targetPath !== '.') {
          await tree.expandPath(getParentPath(targetPath));
        }
        await tree.expandPath(targetPath);
        await notifyChange();
      }
    } catch (err) {
      await appAlert({
        title: '붙여넣기 실패',
        body: err instanceof Error ? err.message : '붙여넣기에 실패했습니다.',
      });
    }
  };

  const handleRename = (entry) => {
    if (!entry) return;
    setRenameEntry(entry);
  };

  const handleRenameConfirm = async (nextName) => {
    if (!renameEntry) return;

    const target = renameEntry;
    const parent = getParentPath(target.relativePath);
    const normalized = parent === '.' ? nextName : joinRelativePath(parent, nextName);

    const siblingNames = (await getSiblingNames(parent)).filter((name) => name !== target.name);
    if (siblingNames.includes(nextName)) {
      throw new Error('같은 이름의 항목이 이미 있습니다.');
    }

    await fs.rename(target.relativePath, normalized);
    setRenameEntry(null);
    await notifyChange();

    if (currentPath === target.relativePath || currentPath.startsWith(`${target.relativePath}/`)) {
      onNavigate(normalized);
    }
  };

  const handleDelete = async (entry) => {
    const confirmed = await appConfirm({
      title: '휴지통으로 이동',
      body: `"${entry.name}"을(를) 휴지통으로 이동할까요?`,
      confirmLabel: '휴지통으로 이동',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await fs.moveToTrash(entry.relativePath);
    if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
      onNavigate(getParentPath(entry.relativePath));
    }
    await notifyChange();
  };

  const handleRestore = async (entry) => {
    try {
      const result = await fs.restoreFromTrash(entry.relativePath);
      await notifyChange();
      await appAlert({
        title: '복원 완료',
        body: result?.restoredPath
          ? `"${entry.name}"을(를) 복원했습니다.\n\n위치: ${result.restoredPath}`
          : `"${entry.name}"을(를) 복원했습니다.`,
      });
    } catch (err) {
      await appAlert({
        title: '복원 실패',
        body: err instanceof Error ? err.message : '복원에 실패했습니다.',
      });
    }
  };

  const handlePermanentDelete = async (entry) => {
    const confirmed = await appConfirm({
      title: '영구 삭제',
      body: `"${entry.name}"을(를) 영구 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '영구 삭제',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    await fs.deletePermanent(entry.relativePath);
    if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
      onNavigate(TRASH_FOLDER);
    }
    await notifyChange();
  };

  const handleEmptyTrash = async () => {
    const confirmed = await appConfirm({
      title: '휴지통 비우기',
      body: '휴지통의 모든 항목을 영구 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.',
      confirmLabel: '휴지통 비우기',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    const wasInTrashView = isInTrashView;
    const wasInTrashSubfolder = isTrashSubfolder(currentPath);
    if (wasInTrashSubfolder) {
      onNavigate(TRASH_FOLDER);
    }

    await fs.emptyTrash();
    await tree.refreshTree();
    await refreshShareMap();
    await refreshAccessMap();
    await refreshFavoritesMap();
    await refreshTrash();

    if (wasInTrashView) {
      onNavigate('.');
    }

    await fs.refresh();
  };

  const handleDuplicate = async (entry) => {
    const parent = getParentPath(entry.relativePath);
    const siblingNames = await getSiblingNames(parent === '.' ? '.' : parent);
    const uniqueName = resolveUniqueName(siblingNames, entry.name);
    const destination = parent === '.' ? uniqueName : joinRelativePath(parent, uniqueName);
    await fs.copyTo(entry.relativePath, destination);
    await notifyChange();
  };

  const handleMove = (entry) => {
    if (!entry) return;
    setMoveDialogEntries([entry]);
  };

  const handleMoveConfirm = async (destinationPath) => {
    if (!moveDialogEntries?.length) return;

    const results = await moveEntries(moveDialogEntries, destinationPath);

    for (const result of results) {
      if (currentPath === result.from || currentPath.startsWith(`${result.from}/`)) {
        onNavigate(result.entry.isDirectory ? result.to : destinationPath);
        break;
      }
    }

    if (destinationPath !== '.') {
      await tree.expandPath(getParentPath(destinationPath));
    }
    await tree.expandPath(destinationPath);
    setMoveDialogEntries(null);
    await notifyChange();
  };

  const handleShowProperties = async (entry) => {
    const info = await fs.stat(entry.relativePath);
    setPropertiesEntry(entry);
    setPropertiesStat(info);
  };

  const handlePropertiesPrivateChange = async (checked) => {
    if (!propertiesEntry) return;
    setPropertiesSaving(true);
    try {
      await setFileAccess(propertiesEntry.relativePath, {
        visibility: checked ? 'private' : 'public',
      });
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '공개 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handlePropertiesViewRestrictedChange = async (checked) => {
    if (!propertiesEntry) return;
    setPropertiesSaving(true);
    try {
      await setFileAccess(propertiesEntry.relativePath, {
        viewRestricted: checked,
      });
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '열람 제한 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handlePropertiesShareViewChange = async (checked) => {
    if (!propertiesEntry) return;
    if (!checked && !propertiesEntryStatus?.isShareViewOnly) return;

    setPropertiesSaving(true);
    try {
      const result = await handleShareModeToggle({
        entry: propertiesEntry,
        checked,
        mode: SHARE_LINK_MODE_VIEW,
        syncInfo,
        shareMap,
        refreshShareMap,
      });
      if (result) setShareLinkDialog(result);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '공유 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handlePropertiesShareEditChange = async (checked) => {
    if (!propertiesEntry) return;
    if (!checked && !propertiesEntryStatus?.isShareEditable) return;

    setPropertiesSaving(true);
    try {
      const result = await handleShareModeToggle({
        entry: propertiesEntry,
        checked,
        mode: SHARE_LINK_MODE_EDIT,
        syncInfo,
        shareMap,
        refreshShareMap,
      });
      if (result) setShareLinkDialog(result);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '공유 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handlePropertiesFavoriteChange = async (checked) => {
    if (!propertiesEntry) return;
    setPropertiesSaving(true);
    try {
      await setFavorite(propertiesEntry.relativePath, checked);
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '즐겨찾기 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handleShareLinkRevoke = async () => {
    if (!shareLinkDialog?.entry) return;
    await revokeShareLinkForEntry({ entry: shareLinkDialog.entry, refreshShareMap });
  };

  const handleOpen = async (entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.relativePath);
      return;
    }
    const canOpen = await guardOpenFileEntry(entry, { onMissing: notifyChange });
    if (!canOpen) return;
    if (!canOpenFileForEdit(entry.relativePath, accessMap, isAdminLoggedIn, effectivePermissions)) {
      nativeAlert(
        !effectivePermissions.write && effectivePermissions.read === false
          ? GUEST_READ_DENIED_MESSAGE
          : VIEW_OPEN_DENIED_MESSAGE,
      );
      return;
    }
    onOpenFile(entry);
  };

  const handleOpenFileFromTree = (entry) => {
    handleOpen(entry);
  };

  const openContextMenu = (event, entry, targetPath = currentPath) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry && !entry.isDirectory) {
      setDownloadTarget(entry);
    }
    setContextMenu({ x: event.clientX, y: event.clientY, entry, targetPath });
  };

  const contextTarget = contextMenu?.entry;
  const contextTargetPath = contextMenu?.targetPath ?? currentPath;
  const propertiesEntryStatus =
    propertiesEntry && !propertiesEntry.isDirectory
      ? resolveFileEntryStatus(propertiesEntry.relativePath, accessMap, shareMap, favoritesMap)
      : null;

  const contextItems = contextTarget
    ? buildEntryContextMenuItems({
        entry: contextTarget,
        targetCount: 1,
        isInTrashView,
        isInFavoritesView,
        hasClipboard,
        onOpen: handleOpen,
        onOpenSystem: (entry) => fs.openInSystem(entry.relativePath),
        onUpload: contextTarget?.isDirectory ? triggerUpload : undefined,
        onCopy: () => copyEntries([contextTarget]),
        onCut: () => cutEntries([contextTarget]),
        onMove: () => handleMove(contextTarget),
        onPaste: () => handlePaste(contextTargetPath),
        onRename: () => handleRename(contextTarget),
        onDuplicate: () => handleDuplicate(contextTarget),
        onDelete: () => handleDelete(contextTarget),
        onRestore: () => handleRestore(contextTarget),
        onPermanentDelete: () => handlePermanentDelete(contextTarget),
        onProperties: () => handleShowProperties(contextTarget),
        onDownload: () => handleDownload(contextTarget),
        canDownload: Boolean(contextTarget && !contextTarget.isDirectory),
        canEditOpen: contextTarget
          ? canOpenFileForEdit(contextTarget.relativePath, accessMap, isAdminLoggedIn, effectivePermissions)
          : false,
        isAdminLoggedIn,
        canWrite,
      })
    : buildBackgroundContextMenuItems({
        targetPath: contextTargetPath,
        isInTrashView,
        isInFavoritesView,
        hasClipboard,
        onCreateFolder: () => openCreateFolderDialog(contextTargetPath),
        onCreateFile: () => openCreateFileDialog(contextTargetPath),
        onUpload: () => triggerUpload(contextTargetPath),
        onPaste: () => handlePaste(contextTargetPath),
        onRefresh: notifyChange,
        onEmptyTrash: handleEmptyTrash,
        isAdminLoggedIn,
        canWrite,
      });

  return (
    <aside
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col bg-nas-sidebar text-slate-200"
      {...dropZoneProps}
    >
      {!isInTrashView && isFileDragOver && (
        <FileDropOverlay message="여기에 파일을 놓으면 업로드" variant="dark" />
      )}

      <SidebarToolbar
        isInTrashView={isInTrashView}
        onCreateFolder={() => openCreateFolderDialog(currentPath)}
        onCreateFile={() => openCreateFileDialog(currentPath)}
        onUpload={() => triggerUpload(currentPath)}
        onDownload={() => handleDownload()}
        canDownload={Boolean(downloadTarget)}
        onRefresh={notifyChange}
        onExpandAll={tree.expandAllLoaded}
        onCollapseAll={tree.collapseAll}
        onPaste={() => handlePaste(currentPath)}
        canPaste={hasClipboard}
      />

      <div className="border-b border-slate-700 px-2 py-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="폴더·파일 검색…"
          className="h-8 w-full rounded-md border border-slate-600 bg-[#efefef] px-3 text-[10pt] text-slate-800 placeholder:text-slate-500 outline-none focus:border-nas-accent"
        />
      </div>

      {isSearchActive ? (
        <FileSearchResults
          results={searchResults}
          searching={searching}
          truncated={truncated}
          currentPath={currentPath}
          onNavigate={onNavigate}
          onOpenFile={handleOpenFileFromTree}
          onContextMenu={openContextMenu}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <DirectoryTree
            currentPath={currentPath}
            rootEntries={tree.rootEntries}
            childrenMap={tree.childrenMap}
            expandedPaths={tree.expandedPaths}
            loadingPaths={tree.loadingPaths}
            onToggleExpand={tree.toggleExpand}
            onNavigate={onNavigate}
            onOpenFile={handleOpenFileFromTree}
            onContextMenu={openContextMenu}
            onBackgroundContextMenu={(event, targetPath = currentPath) =>
              openContextMenu(event, null, targetPath)
            }
          />
        </div>
      )}

      <div className="mt-auto border-t border-slate-700 px-2 py-2 space-y-1">
        <button
          type="button"
          onClick={() => onNavigate(FAVORITES_FOLDER)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10pt] transition-colors ${
            mainView !== 'settings' && isInFavoritesView
              ? 'bg-nas-accent text-white'
              : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
          }`}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.25l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 15.9l-5.04 2.88.96-5.62-4.08-3.98 5.64-.82L12 2.25z" />
          </svg>
          <span className="truncate">즐겨찾기</span>
          {favoritesCount > 0 && (
            <span className="ml-auto rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-100">
              {favoritesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (canWrite) {
              onNavigate(TRASH_FOLDER);
              return;
            }
            void appAlert({
              title: '휴지통',
              body: TRASH_ACCESS_DENIED_MESSAGE,
            });
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'none';
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10pt] transition-colors ${
            mainView !== 'settings' &&
            canWrite &&
            (currentPath === TRASH_FOLDER || currentPath.startsWith(`${TRASH_FOLDER}/`))
              ? 'bg-nas-accent text-white'
              : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
          }`}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm3 0h2v9h-2V9zM6 9h2v9H6V9z" />
          </svg>
          <span className="truncate">휴지통</span>
          {canWrite && trashCount > 0 && (
            <span className="ml-auto rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-100">
              {trashCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (isAdminLoggedIn) {
              onOpenSettings?.();
              return;
            }
            void appAlert({
              title: '환경설정',
              body: '환경설정은 총괄관리자 로그인 후 이용할 수 있습니다.',
            });
          }}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[10pt] transition-colors ${
            isAdminLoggedIn && mainView === 'settings'
              ? 'bg-nas-accent text-white'
              : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
          }`}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.07 7.07 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.77 8.87a.48.48 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.89 14.52a.49.49 0 00-.12.61l1.92 3.32c.12.22.39.3.59.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z" />
          </svg>
          <span className="truncate">환경설정</span>
        </button>
      </div>

      <div className="border-t border-slate-700 px-2 py-2">
        <div className={`flex items-center gap-2${isAdminLoggedIn ? '' : ' px-1'}`}>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">USB 포터블 모드</span>
          {isAdminLoggedIn && <EditorUpdateButton />}
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        hidden
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) await handleUploadFiles(files);
        }}
      />

      {contextMenu && contextItems.length > 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {propertiesEntry && (
        <FilePropertiesDialog
          entry={propertiesEntry}
          statInfo={propertiesStat}
          fileStatus={propertiesEntryStatus}
          isAdminLoggedIn={isAdminLoggedIn}
          accessSaving={propertiesSaving}
          onChangePrivate={handlePropertiesPrivateChange}
          onChangeViewRestricted={handlePropertiesViewRestrictedChange}
          onChangeShareView={handlePropertiesShareViewChange}
          onChangeShareEdit={handlePropertiesShareEditChange}
          onChangeFavorite={handlePropertiesFavoriteChange}
          onClose={() => {
            setPropertiesEntry(null);
            setPropertiesStat(null);
          }}
        />
      )}

      <NewFileDialog
        open={newFileDialogOpen}
        onClose={() => setNewFileDialogOpen(false)}
        onSelect={handleCreateTypedFile}
      />

      <NewFolderDialog
        open={newFolderDialogOpen}
        onClose={() => setNewFolderDialogOpen(false)}
        onConfirm={handleCreateFolderConfirm}
      />

      <RenameDialog
        open={Boolean(renameEntry)}
        entry={renameEntry}
        onClose={() => setRenameEntry(null)}
        onConfirm={handleRenameConfirm}
      />

      <ShareLinkModal
        open={Boolean(shareLinkDialog)}
        url={shareLinkDialog?.url ?? ''}
        fileName={shareLinkDialog?.fileName}
        onRevoke={shareLinkDialog?.entry ? handleShareLinkRevoke : undefined}
        onClose={() => setShareLinkDialog(null)}
      />

      <MoveItemsDialog
        open={Boolean(moveDialogEntries?.length)}
        entries={moveDialogEntries ?? []}
        initialPath={currentPath}
        onClose={() => setMoveDialogEntries(null)}
        onConfirm={handleMoveConfirm}
      />

      {confirmDialog}
    </aside>
  );
}
