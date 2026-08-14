import { useEffect, useMemo, useRef, useState } from 'react';
import Breadcrumb from './Breadcrumb.jsx';
import ContextMenu from './ContextMenu.jsx';
import FileExplorerToolbar from './FileExplorerToolbar.jsx';
import FileList from './FileList.jsx';
import FilePropertiesDialog from './FilePropertiesDialog.jsx';
import NewFileDialog from './NewFileDialog.jsx';
import NewFolderDialog from './NewFolderDialog.jsx';
import RenameDialog from './RenameDialog.jsx';
import MoveItemsDialog from './MoveItemsDialog.jsx';
import ShareLinkModal from '../common/ShareLinkModal.jsx';
import { useFileClipboard } from '../../hooks/useFileClipboard.js';
import { useFileSelection } from '../../hooks/useFileSelection.js';
import { useFileSystem } from '../../hooks/useFileSystem.js';
import { useShareLinks } from '../../hooks/useShareLinks.js';
import { useFileAccess } from '../../hooks/useFileAccess.js';
import { useFavorites } from '../../hooks/useFavorites.js';
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
  filterEntries,
  getParentPath,
  joinRelativePath,
  resolveUniqueName,
  sortEntries,
} from '../../lib/fsPaths.js';
import { resolveFileEntryStatus } from '../../lib/fileEntryStatus.js';
import { downloadFileEntries } from '../../lib/downloadEntries.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { uploadFilesAtPath } from '../../lib/fsWriteActions.js';
import { isTrashPath, isTrashSubfolder, SHARED_FOLDER, TRASH_FOLDER } from '../../lib/trashPaths.js';
import { isTiptapDocumentRelativePath } from '../../../shared/tiptapAssetPaths.js';
import { FAVORITES_FOLDER, isFavoritesPath } from '../../lib/favoritesPaths.js';
import { guardOpenFileEntry } from '../../lib/openFileGuard.js';
import { nativeAlert } from '../../lib/nativeDialog.js';
import { useTrash } from '../../hooks/useTrash.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { useFileDropZone } from '../../hooks/useFileDropZone.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import { useLoginDialog } from '../../context/LoginDialogContext.jsx';
import { useFsSync } from '../../context/FsSyncContext.jsx';
import { useFsRemoteRefresh } from '../../hooks/useFsRemoteRefresh.js';
import { useFolderContentSearch } from '../../hooks/useFolderContentSearch.js';
import FileDropOverlay from '../common/FileDropOverlay.jsx';
import TransferStatusBanner from '../common/TransferStatusBanner.jsx';
import ViewAccessDeniedPanel from '../common/ViewAccessDeniedPanel.jsx';
import { canOpenFileForEdit, VIEW_OPEN_DENIED_MESSAGE, GUEST_READ_DENIED_MESSAGE } from '../../lib/fileEditAccess.js';
import { useGuestPermissions } from '../../hooks/useGuestPermissions.js';
import {
  canWriteAtPath,
  effectivePermissionsForPath,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
} from '../../lib/memberHomes.js';
import { isProtectedSharedSystemPath } from '../../../shared/workspacePaths.js';
import { isExternalMountRootPath, isExternalFolderContainerPath } from '../../../shared/externalFolders.js';
import {
  EXTERNAL_MOUNT_DELETE_HINT,
  isExternalContentPath,
} from '../../lib/externalFoldersUi.js';

export default function FileExplorer({
  currentPath,
  onNavigate,
  onOpenFile,
  syncInfo,
  isEditorOpen = false,
  compactMode = false,
  onShowFolders,
}) {
  const {
    entries,
    loading,
    error,
    refresh,
    createFolder,
    createNewTypedFile,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    deletePermanent,
    rename,
    copyTo,
    uploadFiles,
    stat,
    openInSystem,
  } = useFileSystem(currentPath);

  const {
    selectedPaths,
    selectedSet,
    selectedEntries,
    clearSelection,
    selectOnly,
    toggleSelection,
    selectRange,
    selectAll,
    toggleSelectAllVisible,
  } = useFileSelection(entries);

  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();
  const { shareMap, refreshShareMap } = useShareLinks();
  const { accessMap, refreshAccessMap, setFileAccess } = useFileAccess();
  const { favoritesMap, refreshFavoritesMap, setFavorite } = useFavorites();
  const { isAdminLoggedIn, adminId } = useAdminAuthContext();
  const { openLogin } = useLoginDialog();
  const { effectivePermissions } = useGuestPermissions();
  const globalWrite = Boolean(effectivePermissions.write);
  const canViewContent = Boolean(effectivePermissions.view) || Boolean(effectivePermissions.write);
  const homeViewBypass =
    isAdminLoggedIn &&
    (isHomesContainerPath(currentPath) || isOwnMemberHomePath(currentPath, adminId));
  const showViewAccessDenied = !canViewContent && !homeViewBypass;
  const isInTrashView = isTrashPath(currentPath);
  const isInFavoritesView = isFavoritesPath(currentPath);
  const canWrite = isInTrashView
    ? globalWrite || isAdminLoggedIn
    : canWriteAtPath(currentPath, adminId, isAdminLoggedIn, globalWrite);
  const { notifyLocalChange } = useFsSync();
  const { refresh: refreshTrash } = useTrash();
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();

  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchContents, setSearchContents] = useState(false);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [contextMenu, setContextMenu] = useState(null);
  const [propertiesEntry, setPropertiesEntry] = useState(null);
  const [propertiesStat, setPropertiesStat] = useState(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareLinkDialog, setShareLinkDialog] = useState(null);
  const [moveDialogEntries, setMoveDialogEntries] = useState(null);
  const [renameEntry, setRenameEntry] = useState(null);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [lastSelectedPath, setLastSelectedPath] = useState(null);
  /** @type {[null | { kind: 'upload' | 'download', current: number, total: number, fileName?: string }, Function]} */
  const [transfer, setTransfer] = useState(null);

  const uploadInputRef = useRef(null);
  const uploadTargetPathRef = useRef('.');
  const containerRef = useRef(null);
  const keyHandlersRef = useRef({});

  const contentSearch = useFolderContentSearch(entries, searchQuery, searchContents);

  const visibleEntries = useMemo(() => {
    const byName = filterEntries(entries, searchQuery);
    if (!searchContents || contentSearch.matchedPaths.size === 0) {
      return sortEntries(byName, sortField, sortDirection);
    }

    const seen = new Set(byName.map((entry) => entry.relativePath));
    const merged = [
      ...byName,
      ...entries.filter(
        (entry) =>
          !seen.has(entry.relativePath) && contentSearch.matchedPaths.has(entry.relativePath),
      ),
    ];
    return sortEntries(merged, sortField, sortDirection);
  }, [
    entries,
    searchQuery,
    searchContents,
    contentSearch.matchedPaths,
    sortField,
    sortDirection,
  ]);

  const propertiesEntryStatus = useMemo(() => {
    if (!propertiesEntry || propertiesEntry.isDirectory) return null;
    return resolveFileEntryStatus(propertiesEntry.relativePath, accessMap, shareMap, favoritesMap);
  }, [propertiesEntry, accessMap, shareMap, favoritesMap]);

  const downloadableEntries = useMemo(
    () => selectedEntries.filter((entry) => !entry.isDirectory),
    [selectedEntries],
  );

  const refreshMaps = async () => {
    await refreshShareMap();
    await refreshAccessMap();
    await refreshFavoritesMap();
    await refreshTrash();
  };

  const refreshAll = async (paths) => {
    await refresh();
    await refreshMaps();
    notifyLocalChange('explorer', paths?.length ? { paths } : {});
  };

  useFsRemoteRefresh('explorer', {
    currentPath,
    onRefresh: async () => {
      await refresh();
      await refreshMaps();
    },
    onRefreshMeta: refreshMaps,
  });

  const reportTransferProgress = (kind) => (info) => {
    setTransfer({
      kind,
      current: info.current,
      total: info.total,
      fileName: info.fileName,
    });
  };

  const handleFileDrop = async (files) => {
    if (isInTrashView || isInFavoritesView) return;
    if (transfer) return;

    try {
      setTransfer({ kind: 'upload', current: 0, total: files.length, fileName: files[0]?.name });
      const uploaded = await uploadFiles(files, { onProgress: reportTransferProgress('upload') });
      await refreshAll();
      if (uploaded?.openPath) {
        const name = uploaded.openPath.split('/').pop() || uploaded.openPath;
        onOpenFile({
          relativePath: uploaded.openPath,
          name,
          extension: 'tiptap',
          isDirectory: false,
        });
      }
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    } finally {
      setTransfer(null);
    }
  };

  const { isFileDragOver, dropZoneProps } = useFileDropZone(handleFileDrop, {
    enabled: !isInTrashView && !isInFavoritesView && canWrite,
  });

  useEffect(() => {
    clearSelection();
    setSearchQuery('');
    setContextMenu(null);
  }, [currentPath, clearSelection]);

  const getTargetEntries = (entry) => {
    if (entry && selectedSet.has(entry.relativePath) && selectedEntries.length > 1) {
      return selectedEntries;
    }
    return entry ? [entry] : selectedEntries;
  };

  const handleNavigateUp = () => {
    onNavigate(getParentPath(currentPath));
  };

  const handleCreateFolder = () => {
    setNewFolderDialogOpen(true);
  };

  const handleCreateFolderConfirm = async (name) => {
    await createFolder(name);
    await refreshAll();
  };

  const handleCreateFile = () => {
    setNewFileDialogOpen(true);
  };

  const handleCreateTypedFile = async (type) => {
    setNewFileDialogOpen(false);
    try {
      await createNewTypedFile(type);
      await refreshAll();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '새 파일을 만들 수 없습니다.');
    }
  };

  const triggerUpload = (targetPath = currentPath) => {
    if (isTrashPath(targetPath) || isFavoritesPath(targetPath)) return;
    uploadTargetPathRef.current = targetPath;
    uploadInputRef.current?.click();
  };

  const handleUploadClick = () => {
    triggerUpload(currentPath);
  };

  const handleUploadInput = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (transfer) return;
    try {
      setTransfer({ kind: 'upload', current: 0, total: files.length, fileName: files[0]?.name });
      const uploaded = await uploadFilesAtPath(uploadTargetPathRef.current, files, {
        onProgress: reportTransferProgress('upload'),
      });
      await refreshAll();
      if (uploaded?.openPath) {
        const name = uploaded.openPath.split('/').pop() || uploaded.openPath;
        onOpenFile({
          relativePath: uploaded.openPath,
          name,
          extension: 'tiptap',
          isDirectory: false,
        });
      }
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    } finally {
      setTransfer(null);
    }
  };

  const handleDownload = async (entry) => {
    const targets = entry ? getTargetEntries(entry) : downloadableEntries;
    if (transfer) return;
    try {
      setTransfer({
        kind: 'download',
        current: 0,
        total: targets.filter((item) => !item.isDirectory).length,
        fileName: targets.find((item) => !item.isDirectory)?.name,
      });
      await downloadFileEntries(targets, { onProgress: reportTransferProgress('download') });
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    } finally {
      setTransfer(null);
    }
  };

  const handleExportHtml = async (entry) => {
    if (!entry || entry.isDirectory) return;
    try {
      const fileName = entry.name || entry.relativePath.split('/').pop();
      let saved;
      if (isTiptapDocumentRelativePath(entry.relativePath)) {
        const { exportTiptapFileAsHtml } = await import('../../lib/tiptap/exportHtml.jsx');
        saved = await exportTiptapFileAsHtml(entry.relativePath, fileName);
      } else if (/\.md$/i.test(entry.relativePath)) {
        const { exportMarkdownFileAsHtml } = await import('../../lib/text/exportMarkdown.js');
        saved = await exportMarkdownFileAsHtml(entry.relativePath, fileName);
      } else {
        throw new Error('HTML 내보내기를 지원하지 않는 파일입니다.');
      }
      if (!saved) return;
      nativeAlert(`HTML로 내보냈습니다.\n${saved.absolutePath ?? saved.fileName}`);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : 'HTML로 내보내기에 실패했습니다.');
    }
  };

  const handleShareLinkBadgeClick = async (entry) => {
    try {
      const result = await openShareLinkForEntry({
        entry,
        syncInfo,
        shareMap,
        refreshShareMap,
      });
      setShareLinkDialog(result);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '공유 링크를 열 수 없습니다.');
    }
  };

  const handleShareLinkRevoke = async () => {
    if (!shareLinkDialog?.entry) return;
    await revokeShareLinkForEntry({ entry: shareLinkDialog.entry, refreshShareMap });
  };

  const handleRename = (entry) => {
    const targets = entry ? getTargetEntries(entry) : selectedEntries;
    if (targets.length !== 1) {
      void appAlert({
        title: '이름 변경',
        body: '이름을 변경할 항목 하나를 선택해 주세요.',
      });
      return;
    }
    const target = targets[0];
    if (
      isProtectedSharedSystemPath(target.relativePath) ||
      isHomesContainerPath(target.relativePath) ||
      isMemberHomeRootPath(target.relativePath) ||
      isExternalFolderContainerPath(target.relativePath) ||
      isExternalMountRootPath(target.relativePath)
    ) {
      void appAlert({
        title: '이름 변경',
        body: '공유폴더·개인폴더·외부폴더의 이름은 바꿀 수 없습니다.',
      });
      return;
    }
    setRenameEntry(target);
  };

  const handleRenameConfirm = async (nextName) => {
    if (!renameEntry) return;

    const parent = getParentPath(renameEntry.relativePath);
    const normalized = parent === '.' ? nextName : joinRelativePath(parent, nextName);

    const siblingNames = entries
      .filter((item) => item.relativePath !== renameEntry.relativePath)
      .map((item) => item.name);
    if (siblingNames.includes(nextName)) {
      throw new Error('같은 이름의 항목이 이미 있습니다.');
    }

    await rename(renameEntry.relativePath, normalized);

    if (currentPath === renameEntry.relativePath || currentPath.startsWith(`${renameEntry.relativePath}/`)) {
      onNavigate(normalized);
    }

    setRenameEntry(null);
    clearSelection();
    await refreshAll();
  };

  const handleDelete = async (entry) => {
    const targets = getTargetEntries(entry);
    if (!targets.length) return;

    if (isInTrashView) {
      await handlePermanentDelete(entry);
      return;
    }

    if (targets.some((target) => isExternalMountRootPath(target.relativePath) || isExternalFolderContainerPath(target.relativePath))) {
      await appAlert({
        title: '외부 폴더',
        body: EXTERNAL_MOUNT_DELETE_HINT,
      });
      return;
    }

    // External mounts are not copied into NAS trash — permanent delete only.
    if (targets.every((target) => isExternalContentPath(target.relativePath))) {
      await handlePermanentDelete(entry);
      return;
    }

    const label =
      targets.length === 1
        ? `"${targets[0].name}"을(를) 삭제(휴지통)할까요?`
        : `${targets.length}개 항목을 삭제(휴지통)할까요?`;
    const confirmed = await appConfirm({
      title: '삭제(휴지통)',
      body: label,
      confirmLabel: '삭제(휴지통)',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    try {
      for (const target of targets) {
        await moveToTrash(target.relativePath);
      }
      clearSelection();
      await refreshAll();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '삭제(휴지통)에 실패했습니다.');
    }
  };

  const handlePermanentDelete = async (entry) => {
    const targets = getTargetEntries(entry);
    if (!targets.length) return;

    if (targets.some((target) => isExternalMountRootPath(target.relativePath) || isExternalFolderContainerPath(target.relativePath))) {
      await appAlert({
        title: '외부 폴더',
        body: EXTERNAL_MOUNT_DELETE_HINT,
      });
      return;
    }

    const externalOnly = targets.every((target) => isExternalContentPath(target.relativePath));
    const label =
      targets.length === 1
        ? `"${targets[0].name}"을(를) 삭제(영구)할까요?\n\n이 작업은 되돌릴 수 없습니다.${
            externalOnly ? '\n외부 폴더 항목은 휴지통으로 옮기지 않고 바로 삭제됩니다.' : ''
          }`
        : `${targets.length}개 항목을 삭제(영구)할까요?\n\n이 작업은 되돌릴 수 없습니다.${
            externalOnly ? '\n외부 폴더 항목은 휴지통으로 옮기지 않고 바로 삭제됩니다.' : ''
          }`;
    const confirmed = await appConfirm({
      title: '삭제(영구)',
      body: label,
      confirmLabel: '삭제(영구)',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    try {
      for (const target of targets) {
        await deletePermanent(target.relativePath);
      }
      clearSelection();
      await refreshAll();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '삭제(영구)에 실패했습니다.');
    }
  };

  const handleRestore = async (entry) => {
    const targets = getTargetEntries(entry);
    if (!targets.length) return;

    try {
      /** @type {Array<{ restoredPath?: string }>} */
      const results = [];
      for (const target of targets) {
        results.push(await restoreFromTrash(target.relativePath));
      }
      clearSelection();
      await refreshAll();

      if (targets.length === 1) {
        const restoredPath = results[0]?.restoredPath;
        await appAlert({
          title: '복원 완료',
          body: restoredPath
            ? `"${targets[0].name}"을(를) 복원했습니다.\n\n위치: ${restoredPath}`
            : `"${targets[0].name}"을(를) 복원했습니다.`,
        });
      } else {
        await appAlert({
          title: '복원 완료',
          body: `${targets.length}개 항목을 복원했습니다.`,
        });
      }
    } catch (err) {
      await appAlert({
        title: '복원 실패',
        body: err instanceof Error ? err.message : '복원에 실패했습니다.',
      });
    }
  };

  const handleEmptyTrash = async () => {
    const confirmed = await appConfirm({
      title: '휴지통 비우기',
      body: '휴지통의 모든 항목을 삭제(영구)할까요?\n\n이 작업은 되돌릴 수 없습니다.',
      confirmLabel: '휴지통 비우기',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    const wasInTrashView = isInTrashView;
    const wasInTrashSubfolder = isTrashSubfolder(currentPath);
    if (wasInTrashSubfolder) {
      onNavigate(TRASH_FOLDER);
    }

    let emptyError = null;
    try {
      await emptyTrash();
    } catch (err) {
      // Some items may still be locked (e.g. just moved into trash on Windows) even after the
      // backend's own retries — refresh below regardless so whatever *did* get deleted disappears,
      // then surface the failure instead of leaving the user thinking nothing happened.
      emptyError = err;
    }
    clearSelection();

    if (wasInTrashView) {
      onNavigate(SHARED_FOLDER);
    }

    await refreshAll();

    if (emptyError) {
      await appAlert({
        title: '휴지통 비우기 실패',
        body: emptyError instanceof Error ? emptyError.message : '일부 항목을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  };

  const handleCopy = (entry) => {
    const targets = getTargetEntries(entry);
    copyEntries(targets);
  };

  const handleCut = (entry) => {
    const targets = getTargetEntries(entry);
    cutEntries(targets);
  };

  const handleMove = (entry) => {
    const targets = getTargetEntries(entry);
    if (!targets.length) {
      nativeAlert('이동할 항목을 선택해 주세요.');
      return;
    }
    setMoveDialogEntries(targets);
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

    setMoveDialogEntries(null);
    clearSelection();
    await refreshAll();
  };

  const handlePaste = async (targetPath = currentPath) => {
    let existingNames;
    if (targetPath === currentPath) {
      existingNames = entries.map((entry) => entry.name);
    } else {
      const dirEntries = await window.nas4usb.fs.readDir(targetPath);
      existingNames = dirEntries.map((entry) => entry.name);
    }

    const pasted = await pasteEntries(targetPath, existingNames);
    if (pasted) await refreshAll();
  };

  const handleDuplicate = async (entry) => {
    const target = entry ?? selectedEntries[0];
    if (!target) return;

    const parent = getParentPath(target.relativePath);
    const uniqueName = resolveUniqueName(
      entries.map((item) => item.name),
      target.name,
    );
    const normalized = parent === '.' ? uniqueName : joinRelativePath(parent, uniqueName);

    await copyTo(target.relativePath, normalized);
    await refreshAll();
  };

  const handleOpen = async (entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.relativePath);
      return;
    }
    const canOpen = await guardOpenFileEntry(entry, { onMissing: () => void refreshAll() });
    if (!canOpen) return;
    const pathPerms = effectivePermissionsForPath(
      entry.relativePath,
      adminId,
      isAdminLoggedIn,
      effectivePermissions,
    );
    if (!canOpenFileForEdit(entry.relativePath, accessMap, isAdminLoggedIn, pathPerms)) {
      nativeAlert(
        !pathPerms.write && pathPerms.read === false
          ? GUEST_READ_DENIED_MESSAGE
          : VIEW_OPEN_DENIED_MESSAGE,
      );
      return;
    }
    onOpenFile(entry);
  };

  const handleShowProperties = async (entry) => {
    const target = entry ?? selectedEntries[0];
    if (!target) return;
    const info = await stat(target.relativePath);
    setPropertiesEntry(target);
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
      await refreshAll();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '즐겨찾기 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handleSelect = (entry, event) => {
    if (event.shiftKey && lastSelectedPath) {
      selectRange(lastSelectedPath, entry.relativePath);
    } else if (event.ctrlKey || event.metaKey) {
      toggleSelection(entry.relativePath);
    } else {
      selectOnly(entry.relativePath);
    }
    setLastSelectedPath(entry.relativePath);
  };

  const handleToggleCheckbox = (entry) => {
    toggleSelection(entry.relativePath);
    setLastSelectedPath(entry.relativePath);
  };

  const openContextMenu = (event, entry) => {
    event.preventDefault();
    if (entry) {
      event.stopPropagation();
    }
    if (entry && !selectedSet.has(entry.relativePath)) {
      selectOnly(entry.relativePath);
      setLastSelectedPath(entry.relativePath);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entry: entry ?? null,
      targetPath: currentPath,
    });
  };

  const contextTarget = contextMenu?.entry ?? null;
  const contextTargetPath = contextMenu?.targetPath ?? currentPath;
  const contextTargets = contextTarget ? getTargetEntries(contextTarget) : [];

  const contextItems = contextTarget
    ? buildEntryContextMenuItems({
        entry: contextTarget,
        targetCount: contextTargets.length,
        isInTrashView,
        isInFavoritesView,
        hasClipboard,
        onOpen: handleOpen,
        onOpenSystem: (entry) => openInSystem(entry.relativePath),
        onUpload: contextTarget?.isDirectory ? triggerUpload : undefined,
        onCopy: () => handleCopy(contextTarget),
        onCut: () => handleCut(contextTarget),
        onMove: () => handleMove(contextTarget),
        onPaste: handlePaste,
        onRename: () => handleRename(contextTarget),
        onDuplicate: () => handleDuplicate(contextTarget),
        onDelete: () => handleDelete(contextTarget),
        onRestore: () => handleRestore(contextTarget),
        onPermanentDelete: () => handlePermanentDelete(contextTarget),
        onProperties: () => handleShowProperties(contextTarget),
        onDownload: () => handleDownload(contextTarget),
        canDownload: contextTargets.some((target) => !target.isDirectory),
        onExportHtml: () => handleExportHtml(contextTarget),
        canExportHtml:
          contextTargets.length === 1 &&
          !contextTargets[0].isDirectory &&
          (isTiptapDocumentRelativePath(contextTargets[0].relativePath) ||
            /\.md$/i.test(contextTargets[0].relativePath)),
        canEditOpen: contextTarget
          ? canOpenFileForEdit(
              contextTarget.relativePath,
              accessMap,
              isAdminLoggedIn,
              effectivePermissionsForPath(
                contextTarget.relativePath,
                adminId,
                isAdminLoggedIn,
                effectivePermissions,
              ),
            )
          : false,
        isAdminLoggedIn,
        canWrite: isInTrashView
          ? canWrite
          : canWriteAtPath(
              contextTarget?.relativePath ?? contextTargetPath,
              adminId,
              isAdminLoggedIn,
              globalWrite,
            ),
      })
    : buildBackgroundContextMenuItems({
        targetPath: contextTargetPath,
        isInTrashView,
        isInFavoritesView,
        hasClipboard,
        onCreateFolder: handleCreateFolder,
        onCreateFile: handleCreateFile,
        onUpload: handleUploadClick,
        onPaste: handlePaste,
        onRefresh: refreshAll,
        onEmptyTrash: handleEmptyTrash,
        isAdminLoggedIn,
        canWrite: isInTrashView
          ? canWrite
          : canWriteAtPath(contextTargetPath, adminId, isAdminLoggedIn, globalWrite),
      });

  keyHandlersRef.current = {
    refreshAll,
    handleDelete,
    handlePermanentDelete,
    handleRename,
    selectAll,
    handleCopy,
    handleCut,
    handlePaste,
    currentPath,
    selectedEntries,
    hasClipboard,
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (
        isEditorOpen ||
        document.documentElement.classList.contains('wb4s-embed-mode') ||
        document.querySelector('.modal-dialog--editor')
      ) {
        return;
      }

      const h = keyHandlersRef.current;

      if (event.key === 'F5') {
        event.preventDefault();
        h.refreshAll();
      }
      if (event.key === 'Delete' && h.selectedEntries.length) {
        event.preventDefault();
        h.handleDelete();
      }
      if (event.key === 'F2' && h.selectedEntries.length === 1) {
        event.preventDefault();
        h.handleRename(h.selectedEntries[0]);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        h.selectAll();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && h.selectedEntries.length) {
        event.preventDefault();
        h.handleCopy();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x' && h.selectedEntries.length) {
        event.preventDefault();
        h.handleCut();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && h.hasClipboard) {
        event.preventDefault();
        h.handlePaste(h.currentPath);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 flex-col gap-2"
      {...dropZoneProps}
      onContextMenu={(event) => openContextMenu(event, null)}
    >
      {!isInTrashView && !isInFavoritesView && isFileDragOver && <FileDropOverlay />}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 px-0.5">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchContents ? '이름·본문 검색…' : '현재 폴더 검색…'}
          className="h-8 w-full min-w-0 max-w-[220px] rounded-md border border-nas-border bg-white px-3 text-[10pt] outline-none focus:border-nas-accent focus:ring-1 focus:ring-nas-accent"
        />
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10pt] text-nas-muted"
          title="현재 폴더의 문서 내용까지 검색합니다 (txt·md·hwpx·docx·xlsx·pdf 등). 외부폴더는 본문 검색에서 제외됩니다."
        >
          <input
            type="checkbox"
            checked={searchContents}
            onChange={(event) => setSearchContents(event.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-nas-accent"
          />
            본문 검색
        </label>
      </div>

      {searchContents && searchQuery.trim() && (
        <div className="shrink-0 rounded-md border border-nas-accentBorder bg-nas-accentSoft px-4 py-1.5 text-xs text-nas-accentText">
          {contentSearch.searching
            ? `본문 검색 중… ${contentSearch.scanned}/${contentSearch.total}`
            : `본문 일치 ${contentSearch.matchedPaths.size}건 · ${contentSearch.total}개 파일 검사`}
          {contentSearch.skipped > 0 && ` · 지원하지 않거나 큰 파일 ${contentSearch.skipped}개 제외`}
        </div>
      )}

      <TransferStatusBanner transfer={transfer} />

      <div
        className={`nas-panel relative flex min-h-0 flex-1 flex-col overflow-hidden ${
          transfer ? 'pointer-events-none opacity-90' : ''
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-nas-border px-4 py-3">
          {compactMode && typeof onShowFolders === 'function' ? (
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-nas-border bg-white px-2.5 text-[10pt] text-nas-text hover:bg-nas-sidebarHover"
              onClick={onShowFolders}
              title="폴더 목록으로"
              aria-label="폴더 목록으로"
            >
              <span aria-hidden="true">←</span>
              폴더
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <Breadcrumb currentPath={currentPath} onNavigate={onNavigate} />
          </div>
        </div>
      <FileExplorerToolbar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onToggleSortDirection={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hasSelection={selectedEntries.length > 0}
        canRename={
          selectedEntries.length === 1 &&
          !isProtectedSharedSystemPath(selectedEntries[0].relativePath) &&
          !isHomesContainerPath(selectedEntries[0].relativePath) &&
          !isMemberHomeRootPath(selectedEntries[0].relativePath) &&
          !isExternalFolderContainerPath(selectedEntries[0].relativePath) &&
          !isExternalMountRootPath(selectedEntries[0].relativePath)
        }
        hasClipboard={hasClipboard}
        isInTrashView={isInTrashView}
        isInFavoritesView={isInFavoritesView}
        onNavigateUp={handleNavigateUp}
        onRefresh={refreshAll}
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onUploadClick={handleUploadClick}
        onDownloadClick={() => handleDownload()}
        canDownload={downloadableEntries.length > 0}
        onCopy={() => handleCopy()}
        onCut={() => handleCut()}
        onMove={() => handleMove()}
        onPaste={() => handlePaste(currentPath)}
        onDelete={() => handleDelete()}
        onPermanentDelete={() => handlePermanentDelete()}
        onRestore={() => handleRestore()}
        onEmptyTrash={handleEmptyTrash}
        onRename={() => handleRename()}
        onDuplicate={() => handleDuplicate()}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onProperties={() => handleShowProperties()}
        canShowProperties={selectedEntries.length === 1}
        isAdminLoggedIn={isAdminLoggedIn}
        canWrite={canWrite}
        canEmptyTrash={globalWrite}
        showTrashDelete={
          selectedEntries.length === 0 ||
          !selectedEntries.every((entry) => isExternalContentPath(entry.relativePath))
        }
      />

      {isInTrashView && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          휴지통 · 항목을 복원하거나 삭제(영구)할 수 있습니다. 파일은 복원 후 열어 주세요.
        </div>
      )}

      {isInFavoritesView && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          즐겨찾기 · 등록한 문서를 한곳에서 열어볼 수 있습니다. 속성에서 즐겨찾기를 설정하세요.
        </div>
      )}

      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleUploadInput} />

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showViewAccessDenied ? (
        <ViewAccessDeniedPanel isLoggedIn={isAdminLoggedIn} onLogin={() => openLogin()} />
      ) : (
        <FileList
          entries={visibleEntries}
          loading={loading}
          viewMode={viewMode}
          selectedSet={selectedSet}
          accessMap={accessMap}
          shareMap={shareMap}
          favoritesMap={favoritesMap}
          onOpen={handleOpen}
          onSelect={handleSelect}
          onToggleCheckbox={handleToggleCheckbox}
          onToggleSelectAll={() => toggleSelectAllVisible(visibleEntries)}
          onContextMenu={openContextMenu}
          onBackgroundClick={clearSelection}
          onShareLinkClick={handleShareLinkBadgeClick}
          onPropertiesClick={handleShowProperties}
        />
      )}
      </div>
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
    </div>
  );
}
