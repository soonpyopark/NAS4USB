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
import { useFolderColors } from '../../hooks/useFolderColors.js';
import { useTrash } from '../../hooks/useTrash.js';
import { useFileDropZone } from '../../hooks/useFileDropZone.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import { useLoginDialog } from '../../context/LoginDialogContext.jsx';
import { useFsSync } from '../../context/FsSyncContext.jsx';
import { useFsRemoteRefresh } from '../../hooks/useFsRemoteRefresh.js';
import FileDropOverlay from '../common/FileDropOverlay.jsx';
import TransferStatusBanner from '../common/TransferStatusBanner.jsx';
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
import {
  canRemoveFilePassword,
  canSetFilePassword,
  removePasswordFromEntries,
  setPasswordOnEntries,
} from '../../lib/filePassword/actions.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { TRASH_ACCESS_DENIED_MESSAGE } from '../../../shared/constants.js';
import { isTrashPath, isTrashSubfolder, SHARED_FOLDER, TRASH_FOLDER } from '../../lib/trashPaths.js';
import {
  FAVORITES_FILES_FOLDER,
  FAVORITES_FOLDERS_FOLDER,
  favoritesViewKind,
  isFavoritesPath,
} from '../../lib/favoritesPaths.js';
import {
  canWriteAtPath,
  effectivePermissionsForPath,
  HOMES_FOLDER,
  isHomesContainerPath,
  isMemberHomeRootPath,
  memberHomeRelativePath,
} from '../../lib/memberHomes.js';
import { isProtectedSharedSystemPath } from '../../../shared/workspacePaths.js';
import { isExternalMountRootPath, isExternalFolderContainerPath } from '../../../shared/externalFolders.js';
import {
  EXTERNAL_MOUNT_DELETE_HINT,
  isExternalContentPath,
} from '../../lib/externalFoldersUi.js';
import { isTiptapDocumentRelativePath } from '../../../shared/tiptapAssetPaths.js';
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
  onOpenFile,
  syncInfo,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  /** @type {[null | { kind: 'upload' | 'download', current: number, total: number, fileName?: string }, Function]} */
  const [transfer, setTransfer] = useState(null);
  const tree = useDirectoryTree(currentPath);
  const fs = useFileSystem(currentPath);
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();
  const { results: searchResults, searching, truncated, isActive: isSearchActive } = useFileSearch(
    searchQuery,
  );
  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();
  const { shareMap, refreshShareMap } = useShareLinks();
  const { accessMap, refreshAccessMap, setFileAccess } = useFileAccess();
  const {
    favoritesMap,
    folderFavoritesCount,
    fileFavoritesCount,
    refreshFavoritesMap,
    setFavorite,
    isFavorite,
  } = useFavorites();
  const { folderColorMap, nameBoldMap, refreshFolderColorMap, setFolderColor, setNameBold } =
    useFolderColors();
  const { isAdminLoggedIn, adminId } = useAdminAuthContext();
  const { openLogin } = useLoginDialog();
  const { effectivePermissions } = useGuestPermissions();
  const globalWrite = Boolean(effectivePermissions.write);
  const canViewContent = Boolean(effectivePermissions.view) || Boolean(effectivePermissions.write);
  const showViewAccessDenied = !canViewContent && !isAdminLoggedIn;
  const isInTrashView = isTrashPath(currentPath);
  const isInFavoritesView = isFavoritesPath(currentPath);
  const favoritesView = favoritesViewKind(currentPath);
  const canWrite = isInTrashView
    ? globalWrite || isAdminLoggedIn
    : canWriteAtPath(currentPath, adminId, isAdminLoggedIn, globalWrite);
  const myHomePath = isAdminLoggedIn ? memberHomeRelativePath(adminId) : null;
  const { notifyLocalChange } = useFsSync();
  const canUseTrash = globalWrite || isAdminLoggedIn;
  const { count: trashCount, refresh: refreshTrash } = useTrash({ enabled: canUseTrash });
  const isInMyHomeView = Boolean(
    isAdminLoggedIn &&
      (isHomesContainerPath(currentPath) ||
        (myHomePath &&
          (currentPath === myHomePath || String(currentPath).startsWith(`${myHomePath}/`)))),
  );

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
    await refreshFolderColorMap();
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

  const reportTransferProgress = (kind) => (info) => {
    setTransfer({
      kind,
      current: info.current,
      total: info.total,
      fileName: info.fileName,
    });
  };

  const handleUploadFiles = async (files, targetPath = dialogTargetPathRef.current) => {
    if (transfer) return;
    try {
      setTransfer({ kind: 'upload', current: 0, total: files.length, fileName: files[0]?.name });
      const uploaded = await uploadFilesAtPath(targetPath, files, {
        onProgress: reportTransferProgress('upload'),
      });
      await tree.expandPath(targetPath);
      await notifyChange();
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

  const { isFileDragOver, dropZoneProps } = useFileDropZone(
    (files) => handleUploadFiles(files, currentPath),
    { enabled: !isInTrashView && canWrite && !transfer },
  );

  const handleDownload = async (entry = downloadTarget) => {
    const target = entry && !entry.isDirectory ? entry : downloadTarget;
    if (!target) {
      nativeAlert('다운로드할 파일을 선택해 주세요.');
      return;
    }
    if (transfer) return;

    try {
      setTransfer({ kind: 'download', current: 0, total: 1, fileName: target.name });
      await downloadFileEntries([target], { onProgress: reportTransferProgress('download') });
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
    if (
      isProtectedSharedSystemPath(entry.relativePath) ||
      isHomesContainerPath(entry.relativePath) ||
      isMemberHomeRootPath(entry.relativePath) ||
      isExternalFolderContainerPath(entry.relativePath) ||
      isExternalMountRootPath(entry.relativePath)
    ) {
      void appAlert({
        title: '이름 변경',
        body: '공유폴더·개인폴더·외부폴더의 이름은 바꿀 수 없습니다.',
      });
      return;
    }
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
    if (
      isExternalMountRootPath(entry.relativePath) ||
      isExternalFolderContainerPath(entry.relativePath)
    ) {
      await appAlert({
        title: '외부 폴더',
        body: EXTERNAL_MOUNT_DELETE_HINT,
      });
      return;
    }

    if (isExternalContentPath(entry.relativePath)) {
      await handlePermanentDelete(entry);
      return;
    }

    const confirmed = await appConfirm({
      title: '삭제(휴지통)',
      body: `"${entry.name}"을(를) 삭제(휴지통)할까요?`,
      confirmLabel: '삭제(휴지통)',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    try {
      await fs.moveToTrash(entry.relativePath);
      if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
        onNavigate(getParentPath(entry.relativePath));
      }
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '삭제(휴지통)에 실패했습니다.');
    }
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
    if (
      isExternalMountRootPath(entry.relativePath) ||
      isExternalFolderContainerPath(entry.relativePath)
    ) {
      await appAlert({
        title: '외부 폴더',
        body: EXTERNAL_MOUNT_DELETE_HINT,
      });
      return;
    }

    const externalContent = isExternalContentPath(entry.relativePath);
    const confirmed = await appConfirm({
      title: '삭제(영구)',
      body: `"${entry.name}"을(를) 삭제(영구)할까요?\n\n이 작업은 되돌릴 수 없습니다.${
        externalContent ? '\n외부 폴더 항목은 휴지통으로 옮기지 않고 바로 삭제됩니다.' : ''
      }`,
      confirmLabel: '삭제(영구)',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;
    try {
      const wasInTrash = isTrashPath(entry.relativePath);
      await fs.deletePermanent(entry.relativePath);
      if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
        onNavigate(wasInTrash ? TRASH_FOLDER : getParentPath(entry.relativePath));
      }
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '삭제(영구)에 실패했습니다.');
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
      await fs.emptyTrash();
    } catch (err) {
      // Some items may still be locked (e.g. just moved into trash on Windows) even after the
      // backend's own retries — refresh below regardless so whatever *did* get deleted disappears,
      // then surface the failure instead of leaving the user thinking nothing happened.
      emptyError = err;
    }

    await tree.refreshTree();
    await refreshShareMap();
    await refreshAccessMap();
    await refreshFavoritesMap();
    await refreshTrash();

    if (wasInTrashView) {
      onNavigate(SHARED_FOLDER);
    }

    await fs.refresh();

    if (emptyError) {
      await appAlert({
        title: '휴지통 비우기 실패',
        body: emptyError instanceof Error ? emptyError.message : '일부 항목을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  };

  const handleDuplicate = async (entry) => {
    const parent = getParentPath(entry.relativePath);
    const siblingNames = await getSiblingNames(parent === '.' ? '.' : parent);
    const uniqueName = resolveUniqueName(siblingNames, entry.name, entry.isDirectory);
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

  const handleToggleFavorite = async (entry, favorited) => {
    if (!entry) return;
    try {
      await setFavorite(entry.relativePath, favorited);
      await notifyChange();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '즐겨찾기 설정 변경에 실패했습니다.');
    }
  };

  const handleSetFolderColor = async (entry, color) => {
    if (!entry?.isDirectory) return;
    try {
      await setFolderColor(entry.relativePath, color);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '폴더 색을 바꾸지 못했습니다.');
    }
  };

  const handleSetNameBold = async (entry, bold) => {
    if (!entry) return;
    try {
      await setNameBold(entry.relativePath, bold);
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '주요 파일 표시를 바꾸지 못했습니다.');
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

  const handleSetPassword = async (entry) => {
    if (!entry || entry.isDirectory) return;
    if (canRemoveFilePassword(entry)) {
      await removePasswordFromEntries([entry]);
    } else if (canSetFilePassword(entry)) {
      await setPasswordOnEntries([entry]);
    }
    notifyChange();
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
        onSetPassword: () => handleSetPassword(contextTarget),
        canSetPassword: Boolean(
          contextTarget &&
            (canSetFilePassword(contextTarget) || canRemoveFilePassword(contextTarget)),
        ),
        passwordActionLabel: canRemoveFilePassword(contextTarget) ? '비밀번호 해제' : '비밀번호 설정',
        onExportHtml: () => handleExportHtml(contextTarget),
        canExportHtml: Boolean(
          contextTarget &&
            !contextTarget.isDirectory &&
            (isTiptapDocumentRelativePath(contextTarget.relativePath) ||
              /\.md$/i.test(contextTarget.relativePath)),
        ),
        onToggleFavorite: (favorited) => handleToggleFavorite(contextTarget, favorited),
        isFavorite: Boolean(contextTarget && isFavorite(contextTarget.relativePath)),
        onSetFolderColor: (color) => handleSetFolderColor(contextTarget, color),
        folderColor: contextTarget ? folderColorMap[contextTarget.relativePath] || '' : '',
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
        onCreateFolder: () => openCreateFolderDialog(contextTargetPath),
        onCreateFile: () => openCreateFileDialog(contextTargetPath),
        onUpload: () => triggerUpload(contextTargetPath),
        onPaste: () => handlePaste(contextTargetPath),
        onRefresh: notifyChange,
        onEmptyTrash: handleEmptyTrash,
        isAdminLoggedIn,
        canWrite: isInTrashView
          ? canWrite
          : canWriteAtPath(contextTargetPath, adminId, isAdminLoggedIn, globalWrite),
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

      <TransferStatusBanner transfer={transfer} variant="dark" />

      <div className="border-b border-slate-700 px-2 py-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="폴더·파일 검색 (외부폴더 제외)…"
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
          folderColorMap={folderColorMap}
          nameBoldMap={nameBoldMap}
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
            viewAccessDenied={showViewAccessDenied}
            onBackgroundContextMenu={(event, targetPath = currentPath) =>
              openContextMenu(event, null, targetPath)
            }
            folderColorMap={folderColorMap}
            nameBoldMap={nameBoldMap}
          />
        </div>
      )}

      <div className="mt-auto border-t border-slate-700 px-2 py-2">
        <div className="flex items-stretch gap-1">
          <button
            type="button"
            title="폴더 즐겨찾기"
            aria-label={
              folderFavoritesCount > 0
                ? `폴더 즐겨찾기 ${folderFavoritesCount}개`
                : '폴더 즐겨찾기'
            }
            onClick={() => onNavigate(FAVORITES_FOLDERS_FOLDER)}
            className={`relative flex min-w-0 flex-1 items-center justify-center rounded-md py-2.5 transition-colors ${
              mainView !== 'settings' && favoritesView === 'folders'
                ? 'bg-nas-accent text-white'
                : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h3.2l1.8 2h7A1.5 1.5 0 0 1 19 7.5V11h-2V8h-7.3L7.9 6H6v12h5v2H5.5A1.5 1.5 0 0 1 4 18.5Z" />
              <path d="M17.5 12l1.55 3.14 3.45.5-2.5 2.44.59 3.45-3.09-1.63-3.09 1.63.59-3.45-2.5-2.44 3.45-.5Z" />
            </svg>
            {folderFavoritesCount > 0 && (
              <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-slate-600 px-1 text-center text-[10px] leading-4 text-slate-100">
                {folderFavoritesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            title="파일 즐겨찾기"
            aria-label={
              fileFavoritesCount > 0 ? `파일 즐겨찾기 ${fileFavoritesCount}개` : '파일 즐겨찾기'
            }
            onClick={() => onNavigate(FAVORITES_FILES_FOLDER)}
            className={`relative flex min-w-0 flex-1 items-center justify-center rounded-md py-2.5 transition-colors ${
              mainView !== 'settings' && (favoritesView === 'files' || favoritesView === 'all')
                ? 'bg-nas-accent text-white'
                : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.25l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 15.9l-5.04 2.88.96-5.62-4.08-3.98 5.64-.82L12 2.25z" />
            </svg>
            {fileFavoritesCount > 0 && (
              <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-slate-600 px-1 text-center text-[10px] leading-4 text-slate-100">
                {fileFavoritesCount}
              </span>
            )}
          </button>

          {myHomePath && (
            <button
              type="button"
              title="내 폴더"
              aria-label="내 폴더"
              onClick={() => onNavigate(HOMES_FOLDER)}
              className={`relative flex min-w-0 flex-1 items-center justify-center rounded-md py-2.5 transition-colors ${
                mainView !== 'settings' && isInMyHomeView
                  ? 'bg-nas-accent text-white'
                  : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 3l8 6v11a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1V9l8-6z" />
              </svg>
            </button>
          )}

          <button
            type="button"
            title="휴지통"
            aria-label={canUseTrash && trashCount > 0 ? `휴지통 ${trashCount}개` : '휴지통'}
            onClick={() => {
              if (canUseTrash) {
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
            className={`relative flex min-w-0 flex-1 items-center justify-center rounded-md py-2.5 transition-colors ${
              mainView !== 'settings' &&
              canUseTrash &&
              (currentPath === TRASH_FOLDER || currentPath.startsWith(`${TRASH_FOLDER}/`))
                ? 'bg-nas-accent text-white'
                : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm3 0h2v9h-2V9zM6 9h2v9H6V9z" />
            </svg>
            {canUseTrash && trashCount > 0 && (
              <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-slate-600 px-1 text-center text-[10px] leading-4 text-slate-100">
                {trashCount}
              </span>
            )}
          </button>

          {isAdminLoggedIn && <EditorUpdateButton variant="icon" />}
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
          isFavorite={isFavorite(propertiesEntry.relativePath)}
          isAdminLoggedIn={isAdminLoggedIn}
          accessSaving={propertiesSaving}
          onChangePrivate={handlePropertiesPrivateChange}
          onChangeViewRestricted={handlePropertiesViewRestrictedChange}
          onChangeShareView={handlePropertiesShareViewChange}
          onChangeShareEdit={handlePropertiesShareEditChange}
          onChangeFavorite={handlePropertiesFavoriteChange}
          folderColor={folderColorMap[propertiesEntry.relativePath] || ''}
          canChangeFolderColor={canWriteAtPath(
            propertiesEntry.relativePath,
            adminId,
            isAdminLoggedIn,
            globalWrite,
          )}
          onChangeFolderColor={(color) => handleSetFolderColor(propertiesEntry, color)}
          nameBold={Boolean(nameBoldMap[propertiesEntry.relativePath])}
          canChangeNameBold={canWriteAtPath(
            propertiesEntry.relativePath,
            adminId,
            isAdminLoggedIn,
            globalWrite,
          )}
          onChangeNameBold={(bold) => handleSetNameBold(propertiesEntry, bold)}
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
