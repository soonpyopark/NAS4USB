import { useEffect, useMemo, useRef, useState } from 'react';
import Breadcrumb from './Breadcrumb.jsx';
import ContextMenu from './ContextMenu.jsx';
import FileExplorerToolbar from './FileExplorerToolbar.jsx';
import FileList from './FileList.jsx';
import FilePreviewPane from './FilePreviewPane.jsx';
import { useTouchUi } from '../../hooks/useTouchUi.js';
import { canPreviewEntry, isAudioOrVideoEntry } from '../../lib/filePreview.js';
import { withHighlightQuery } from '../../lib/searchHighlight.js';
import { withSearchOpenTarget } from '../../../shared/docSearchLocation.js';
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
import { useFolderColors } from '../../hooks/useFolderColors.js';
import { useExternalFolders } from '../../hooks/useExternalFolders.js';
import { useFolderOrder } from '../../hooks/useFolderOrder.js';
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
import {
  DEFAULT_CUSTOM_LIST_SORT,
  DEFAULT_NAME_LIST_SORT,
  nextExplorerListSort,
} from '../../lib/explorerListSort.js';
import {
  canMoveFolderOrder,
  favoriteOrderKey,
  folderOrderKindByName,
  folderOrderKey,
  folderOrderNamesAfterRename,
  folderOrderNamesAfterRenames,
  materializeFolderOrder,
  moveFolderOrderName,
  placeFolderOrderNames,
} from '../../lib/folderOrder.js';
import {
  canChangeFolderOrder,
  isFixedFolderOrderPath,
  resolveFolderOrderParent,
} from '../../../shared/folderOrder.js';
import {
  areAllParentsCollapsed,
  buildFileIndentInfo,
  filterCollapsedEntries,
  parentFilesWithChildren,
} from '../../../shared/fileIndent.js';
import {
  applyFileIndentDelta,
  canIndentFileDown,
  canIndentFileUp,
} from '../../lib/fileIndentActions.js';
import { resolveFileEntryStatus } from '../../lib/fileEntryStatus.js';
import { downloadFileEntries } from '../../lib/downloadEntries.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { uploadFilesAtPath } from '../../lib/fsWriteActions.js';
import { isTrashPath, isTrashSubfolder, SHARED_FOLDER, TRASH_FOLDER } from '../../lib/trashPaths.js';
import { isTiptapDocumentRelativePath } from '../../../shared/tiptapAssetPaths.js';
import { favoritesViewKind, isFavoritesPath } from '../../lib/favoritesPaths.js';
import { guardOpenFileEntry } from '../../lib/openFileGuard.js';
import {
  canRemoveFilePassword,
  canSetFilePassword,
  removePasswordFromEntries,
  setPasswordOnEntries,
} from '../../lib/filePassword/actions.js';
import { nativeAlert } from '../../lib/nativeDialog.js';
import { useTrash } from '../../hooks/useTrash.js';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { useFileDropZone } from '../../hooks/useFileDropZone.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import { useLoginDialog } from '../../context/LoginDialogContext.jsx';
import { useFsSync } from '../../context/FsSyncContext.jsx';
import { useFsRemoteRefresh } from '../../hooks/useFsRemoteRefresh.js';
import { useFolderContentSearch } from '../../hooks/useFolderContentSearch.js';
import { usePersonalDocSearch } from '../../hooks/usePersonalDocSearch.js';
import { fsEntryFromDocHit, indexHitsInCurrentFolder } from '../../lib/mergeNameAndDocHits.js';
import PersonalDocIndexBar from '../layout/PersonalDocIndexBar.jsx';
import FileDropOverlay from '../common/FileDropOverlay.jsx';
import TransferStatusBanner from '../common/TransferStatusBanner.jsx';
import ViewAccessDeniedPanel from '../common/ViewAccessDeniedPanel.jsx';
import { canOpenFileForEdit, VIEW_OPEN_DENIED_MESSAGE, GUEST_READ_DENIED_MESSAGE } from '../../lib/fileEditAccess.js';
import { useGuestPermissions } from '../../hooks/useGuestPermissions.js';
import {
  canClearFolderBackups,
  canClearOrphanCaches,
  canWriteAtPath,
  effectivePermissionsForPath,
  HOMES_FOLDER,
  isHomesContainerPath,
  isMemberHomeRootPath,
  isOwnMemberHomePath,
  isUnderHomesFolder,
  memberHomeRelativePath,
  visibleParentPath,
} from '../../lib/memberHomes.js';
import { isProtectedSharedSystemPath } from '../../../shared/workspacePaths.js';
import {
  isExternalMountRootPath,
  isExternalFolderContainerPath,
  isExternalFolderPath,
  labelForExternalMountPath,
} from '../../../shared/externalFolders.js';
import {
  EXTERNAL_MOUNT_DELETE_HINT,
  isExternalContentPath,
} from '../../lib/externalFoldersUi.js';

function SidebarCollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16.25 8.75 13 12l3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12.75 8.75 16 12l-3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FileExplorer({
  currentPath,
  onNavigate,
  onOpenFile,
  syncInfo,
  isEditorOpen = false,
  compactMode = false,
  onShowFolders,
  sidebarCollapsed = false,
  onToggleSidebar,
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
  const { favoritesMap, refreshFavoritesMap, setFavorite, setFavoriteOrder, isFavorite } =
    useFavorites();
  const {
    folderColorMap,
    nameBoldMap,
    fileLevelMap,
    fileCollapsedMap,
    refreshFolderColorMap,
    setFolderColor,
    setNameBold,
    setFileLevels,
    setFileCollapsed,
    setFileCollapsedMany,
  } = useFolderColors();
  const { folderOrderMap, refreshFolderOrderMap, setFolderOrder } = useFolderOrder();
  const { isAdminLoggedIn, adminId, isSuperAdmin } = useAdminAuthContext();
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
  const favoritesView = favoritesViewKind(currentPath);
  const canWrite = isInTrashView
    ? globalWrite || isAdminLoggedIn
    : canWriteAtPath(currentPath, adminId, isAdminLoggedIn, globalWrite, isSuperAdmin);
  const { notifyLocalChange } = useFsSync();
  const { refresh: refreshTrash } = useTrash();
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchContents, setSearchContents] = useState(true);
  const [starOnly, setStarOnly] = useState(false);
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
  const [importingOnenote, setImportingOnenote] = useState(false);
  const [clearingExternalCaches, setClearingExternalCaches] = useState(false);
  const [clearingFolderBackups, setClearingFolderBackups] = useState(false);
  /** @type {[null | { kind: 'upload' | 'download', current: number, total: number, fileName?: string, bytes?: number, totalBytes?: number }, Function]} */
  const [transfer, setTransfer] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState(/** @type {import('../../types/nas4usb.d.ts').FsEntry | null} */ (null));
  const [previewAnchorPath, setPreviewAnchorPath] = useState(/** @type {string | null} */ (null));
  const touchUi = useTouchUi();
  const externalFolders = useExternalFolders();

  const uploadInputRef = useRef(null);
  const onenoteInputRef = useRef(null);
  const uploadTargetPathRef = useRef('.');
  const containerRef = useRef(null);
  const keyHandlersRef = useRef({});
  const restorePreviewAfterEditorRef = useRef(false);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (isExternalFolderPath(currentPath)) {
      onNavigate('.');
    }
  }, [currentPath, isSuperAdmin, onNavigate]);

  const inPersonalFolder = Boolean(
    isAdminLoggedIn &&
      (isHomesContainerPath(currentPath) || isOwnMemberHomePath(currentPath, adminId) || isUnderHomesFolder(currentPath)),
  );
  const myHomePath = isAdminLoggedIn ? memberHomeRelativePath(adminId) : null;
  const usePersonalIndex = Boolean(isAdminLoggedIn && searchContents);
  const contentSearch = useFolderContentSearch(entries, searchQuery, searchContents);
  const docSearch = usePersonalDocSearch(searchQuery, usePersonalIndex);
  const indexFolderHits = useMemo(
    () => (usePersonalIndex ? indexHitsInCurrentFolder(docSearch.results, currentPath, myHomePath) : new Set()),
    [usePersonalIndex, docSearch.results, currentPath, myHomePath],
  );
  const orderParentPath = useMemo(
    () => resolveFolderOrderParent(currentPath, adminId, entries[0]?.relativePath),
    [adminId, currentPath, entries],
  );
  const currentOrderNames = useMemo(
    () =>
      isInFavoritesView
        ? entries.map((entry) => entry.relativePath)
        : folderOrderMap[orderParentPath] ?? [],
    [entries, folderOrderMap, isInFavoritesView, orderParentPath],
  );
  const [listSort, setListSort] = useState(DEFAULT_CUSTOM_LIST_SORT);
  const allowCustomSort = !isInTrashView;
  const orderKeyOf = isInFavoritesView ? favoriteOrderKey : folderOrderKey;
  const orderOptions = isInFavoritesView
    ? { includeFixed: true, pinWorkspaceRoots: false }
    : undefined;
  const isOrderLocked = (relativePath) =>
    !isInFavoritesView && isFixedFolderOrderPath(relativePath);
  const canReorderFavorites = isInFavoritesView && isAdminLoggedIn;
  const canReorder =
    ((canReorderFavorites && allowCustomSort) ||
      canChangeFolderOrder(currentPath, { isSuperAdmin, loginId: adminId })) &&
    allowCustomSort &&
    listSort.field === 'custom' &&
    !searchQuery.trim() &&
    !starOnly;

  useEffect(() => {
    setListSort(allowCustomSort ? DEFAULT_CUSTOM_LIST_SORT : DEFAULT_NAME_LIST_SORT);
  }, [allowCustomSort, currentPath]);

  const visibleEntries = useMemo(() => {
    const needle = searchQuery.trim();
    const matched = !needle
      ? entries
      : searchContents
        ? (() => {
            const contentPaths = new Set([
              ...contentSearch.matchedPaths,
              ...indexFolderHits,
            ]);
            const seen = new Set();
            const list = [];
            const firstHitByPath = new Map();
            for (const hit of docSearch.results) {
              if (!hit.relativePath || firstHitByPath.has(hit.relativePath)) continue;
              firstHitByPath.set(hit.relativePath, hit);
            }
            for (const entry of entries) {
              if (!contentPaths.has(entry.relativePath)) continue;
              seen.add(entry.relativePath);
              const hit = firstHitByPath.get(entry.relativePath);
              list.push(
                hit
                  ? {
                      ...entry,
                      searchLocation: hit.location,
                      searchSnippet: hit.content,
                      locationJson: hit.locationJson,
                    }
                  : entry,
              );
            }
            for (const hit of docSearch.results) {
              if (!hit.relativePath || seen.has(hit.relativePath)) continue;
              seen.add(hit.relativePath);
              list.push(fsEntryFromDocHit(hit));
            }
            return list;
          })()
        : filterEntries(entries, searchQuery);
    const filtered = starOnly
      ? matched.filter((entry) => entry.isDirectory || nameBoldMap[entry.relativePath])
      : matched;
    return sortEntries(filtered, listSort.field, listSort.direction, currentOrderNames, {
      pinWorkspaceRoots: !isInFavoritesView,
    });
  }, [
    entries,
    searchQuery,
    searchContents,
    contentSearch.matchedPaths,
    indexFolderHits,
    docSearch.results,
    starOnly,
    nameBoldMap,
    listSort,
    currentOrderNames,
    isInFavoritesView,
  ]);

  const fileIndentInfo = useMemo(
    () => buildFileIndentInfo(visibleEntries, fileLevelMap, fileCollapsedMap),
    [visibleEntries, fileLevelMap, fileCollapsedMap],
  );
  const listEntries = useMemo(() => {
    if (searchQuery.trim()) return visibleEntries;
    return filterCollapsedEntries(visibleEntries, fileLevelMap, fileCollapsedMap);
  }, [visibleEntries, searchQuery, fileLevelMap, fileCollapsedMap]);

  const handleListSort = (column) => {
    setListSort((current) => nextExplorerListSort(current, column, allowCustomSort));
  };

  const folderCounts = useMemo(() => {
    let folders = 0;
    let files = 0;
    for (const entry of entries) {
      if (entry.isDirectory) folders += 1;
      else files += 1;
    }
    return { folders, files, total: folders + files };
  }, [entries]);

  useEffect(() => {
    setPreviewOpen(false);
    setPreviewEntry(null);
    setPreviewAnchorPath(null);
  }, [currentPath]);

  useEffect(() => {
    if (isEditorOpen) {
      restorePreviewAfterEditorRef.current = previewOpen;
      setPreviewOpen(false);
      return;
    }
    if (restorePreviewAfterEditorRef.current && previewEntry) {
      setPreviewOpen(true);
    }
    restorePreviewAfterEditorRef.current = false;
  }, [isEditorOpen]);

  const canPreviewView = (entry) => {
    if (!entry || entry.isDirectory) return true;
    if (isInTrashView) return false;
    const pathPerms = effectivePermissionsForPath(
      entry.relativePath,
      adminId,
      isAdminLoggedIn,
      effectivePermissions,
      isSuperAdmin,
    );
    return canOpenFileForEdit(entry.relativePath, accessMap, isAdminLoggedIn, pathPerms);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewAnchorPath(null);
  };

  const openPreviewFor = (entry, { fromList = false } = {}) => {
    if (!entry) return;
    if (isAudioOrVideoEntry(entry)) return;
    if (touchUi && entry.isDirectory) {
      onNavigate(entry.relativePath);
      return;
    }
    if (isInTrashView || isInFavoritesView) return;
    if (fromList) {
      setPreviewAnchorPath(entry.isDirectory ? entry.relativePath : currentPath);
    }
    setPreviewEntry(entry);
    if (canPreviewView(entry) && (touchUi || canPreviewEntry(entry) || previewOpen)) {
      setPreviewOpen(true);
    }
  };

  const persistOrder = async (next, kindHint) => {
    if (isInFavoritesView) {
      const kind = kindHint === 'folder' || kindHint === 'file' ? kindHint : 'file';
      const paths = next.filter((key) =>
        entries.some(
          (entry) =>
            entry.relativePath === key && (kind === 'folder' ? entry.isDirectory : !entry.isDirectory),
        ),
      );
      await setFavoriteOrder(kind, paths);
      await refresh();
      return;
    }
    await setFolderOrder(orderParentPath, next);
  };

  const handleMoveOrderFor = async (entry, delta) => {
    if (!canReorder) return;
    if (!entry || isOrderLocked(entry.relativePath)) return;
    const names = materializeFolderOrder(entries, currentOrderNames, orderKeyOf, orderOptions);
    const next = moveFolderOrderName(
      names,
      orderKeyOf(entry),
      delta,
      folderOrderKindByName(entries, orderKeyOf),
    );
    if (next.every((name, index) => name === names[index])) return;
    try {
      await persistOrder(next, entry.isDirectory ? 'folder' : 'file');
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '순서를 바꾸지 못했습니다.');
    }
  };

  const handlePlaceOrder = async (dragged, target, place) => {
    if (!canReorder) return;
    if (!dragged || !target || isOrderLocked(dragged.relativePath)) return;
    if (isOrderLocked(target.relativePath)) return;
    if (dragged.isDirectory !== target.isDirectory) return;

    const movingEntries = selectedSet.has(dragged.relativePath)
      ? selectedEntries.filter(
          (entry) =>
            entry.isDirectory === dragged.isDirectory && !isOrderLocked(entry.relativePath),
        )
      : [dragged];
    if (movingEntries.length === 0) return;

    const names = materializeFolderOrder(entries, currentOrderNames, orderKeyOf, orderOptions);
    const next = placeFolderOrderNames(
      names,
      movingEntries.map((entry) => orderKeyOf(entry)),
      orderKeyOf(target),
      place,
      folderOrderKindByName(entries, orderKeyOf),
    );
    if (next.every((name, index) => name === names[index])) return;
    try {
      await persistOrder(next, dragged.isDirectory ? 'folder' : 'file');
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '순서를 바꾸지 못했습니다.');
    }
  };

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
    await refreshFolderColorMap();
    await refreshFolderOrderMap();
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
      bytes: info.bytes,
      totalBytes: info.totalBytes,
    });
  };

  const handleFileDrop = async (files, meta) => {
    if (isInTrashView || isInFavoritesView) return;
    if (transfer) return;

    try {
      setTransfer({ kind: 'upload', current: 0, total: files.length, fileName: files[0]?.name });
      const uploaded = await uploadFiles(files, {
        onProgress: reportTransferProgress('upload'),
        emptyDirs: meta?.emptyDirs,
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
    onNavigate(visibleParentPath(currentPath, adminId));
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

  const handleImportOnenoteClick = () => {
    if (isInTrashView || isInFavoritesView || !canWrite || importingOnenote) return;
    if (isExternalFolderPath(currentPath)) return;
    onenoteInputRef.current?.click();
  };

  const handleClearFolderBackups = async () => {
    if (
      isInTrashView ||
      isInFavoritesView ||
      !canWrite ||
      !canClearFolderBackups(currentPath) ||
      clearingFolderBackups
    ) {
      return;
    }

    const folderLabel = isHomesContainerPath(currentPath) || isMemberHomeRootPath(currentPath)
      ? HOMES_FOLDER
      : currentPath === SHARED_FOLDER
        ? SHARED_FOLDER
        : labelForExternalMountPath(currentPath, externalFolders) ||
          currentPath.split('/').pop() ||
          currentPath;

    const confirmed = await appConfirm({
      title: '백업 일괄 제거',
      body: `"${folderLabel}" 폴더와 그 하위 폴더·파일의 백업(이력)을 모두 삭제할까요?\n\n원본 파일은 그대로 두고 백업만 제거됩니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '백업 일괄 제거',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    setClearingFolderBackups(true);
    try {
      const result = await window.nas4usb.history.clearTree(currentPath);
      const files = Number(result?.clearedFiles) || 0;
      const entriesCount = Number(result?.clearedEntries) || 0;
      if (files === 0) {
        await appAlert({
          title: '백업 일괄 제거',
          body: '제거할 백업이 없습니다.',
        });
        return;
      }
      await appAlert({
        title: '백업 일괄 제거',
        body: `파일 ${files}개의 백업을 제거했습니다.${
          entriesCount > 0 ? ` (이력 ${entriesCount}개)` : ''
        }`,
      });
    } catch (err) {
      await appAlert({
        title: '백업 일괄 제거 실패',
        body: err instanceof Error ? err.message : '백업을 제거하지 못했습니다.',
      });
    } finally {
      setClearingFolderBackups(false);
    }
  };

  const handleClearExternalCaches = async () => {
    if (
      isInTrashView ||
      isInFavoritesView ||
      !canClearOrphanCaches(currentPath, isSuperAdmin) ||
      (!isExternalFolderPath(currentPath) && !canWrite) ||
      clearingExternalCaches
    ) {
      return;
    }

    const isExternal = isExternalFolderPath(currentPath);
    const folderLabel = isHomesContainerPath(currentPath) || isMemberHomeRootPath(currentPath)
      ? HOMES_FOLDER
      : currentPath === SHARED_FOLDER
        ? SHARED_FOLDER
        : labelForExternalMountPath(currentPath, externalFolders) ||
          currentPath.split('/').pop() ||
          currentPath;
    const confirmed = await appConfirm({
      title: '캐시 정리',
      body: isExternal
        ? '연결된 외부 폴더에서 원본이 없는 PDF 표시·파일 이력·엑셀/문서 보조 파일만 삭제할까요?\n\n아직 있는 파일의 하이라이트와 원본은 그대로 둡니다. 이 작업은 되돌릴 수 없습니다.'
        : `"${folderLabel}" 폴더와 그 하위에서 원본이 없는 PDF 표시·파일 이력·엑셀/문서 보조 파일만 삭제할까요?\n\n아직 있는 파일의 하이라이트·백업과 원본은 그대로 둡니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '캐시 정리',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    setClearingExternalCaches(true);
    try {
      const result = await window.nas4usb.external.clearOrphanCaches(currentPath);
      const parts = [];
      const pdf = (Number(result?.pdfViewerCache) || 0) + (Number(result?.pdfViewerSidecar) || 0);
      const history = (Number(result?.fileHistory) || 0) + (Number(result?.hwpxHistory) || 0);
      const fortune = Number(result?.fortuneSidecar) || 0;
      const tiptap = Number(result?.tiptapAssets) || 0;
      if (pdf) parts.push(`PDF 표시 ${pdf}개`);
      if (history) parts.push(`파일 이력 ${history}개`);
      if (fortune) parts.push(`엑셀 보조 ${fortune}개`);
      if (tiptap) parts.push(`문서 자산 ${tiptap}개`);
      const skipped = Number(result?.skippedUnreadableMounts) || 0;
      const skipNote =
        skipped > 0
          ? `\n\n연결되지 않은 외부 폴더 ${skipped}곳은 건너뛰었습니다. 해당 폴더의 캐시는 그대로 둡니다.`
          : '';
      if (parts.length === 0) {
        await appAlert({
          title: '캐시 정리',
          body: `정리할 고아 캐시가 없습니다.${skipNote}`,
        });
        return;
      }
      await appAlert({
        title: '캐시 정리',
        body: `${parts.join(', ')}를 정리했습니다.${skipNote}`,
      });
      await refreshAll();
    } catch (err) {
      await appAlert({
        title: '캐시 정리 실패',
        body: err instanceof Error ? err.message : '캐시를 정리하지 못했습니다.',
      });
    } finally {
      setClearingExternalCaches(false);
    }
  };

  const handleOnenoteInput = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || importingOnenote || isExternalFolderPath(currentPath)) return;

    setImportingOnenote(true);
    try {
      const { importOnenoteToFolder } = await import('../../lib/onenote/importOnenoteToFolder.js');
      /** @type {string[]} */
      const changedPaths = [];
      /** @type {string[]} */
      const warnings = [];
      /** @type {string | null} */
      let openPath = null;
      for (const file of files) {
        const imported = await importOnenoteToFolder(currentPath, file, { keepOriginal: false });
        if (!imported) continue;
        changedPaths.push(imported.folderPath);
        warnings.push(...(imported.warnings ?? []));
        if (!openPath) openPath = imported.firstFilePath;
      }
      await refreshAll(changedPaths);
      if (warnings.length) {
        await nativeAlert(`원노트 가져오기를 마쳤습니다.\n\n${warnings.join('\n')}`);
      }
      if (openPath) {
        onOpenFile({
          relativePath: openPath,
          name: openPath.split('/').pop() || openPath,
          extension: 'tiptap',
          isDirectory: false,
        });
      }
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '원노트 가져오기에 실패했습니다.');
    } finally {
      setImportingOnenote(false);
    }
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

    const fromKey = orderKeyOf(renameEntry);
    const toKey = isInFavoritesView ? normalized : nextName;
    const canKeepPlace =
      !isInTrashView &&
      (isInFavoritesView
        ? isAdminLoggedIn
        : canChangeFolderOrder(currentPath, { isSuperAdmin, loginId: adminId }));
    const sortedAll = sortEntries(entries, listSort.field, listSort.direction, currentOrderNames, {
      pinWorkspaceRoots: !isInFavoritesView,
    });
    const nextOrder = folderOrderNamesAfterRename(
      sortedAll,
      fromKey,
      toKey,
      orderKeyOf,
      orderOptions,
    );

    await rename(renameEntry.relativePath, normalized);

    if (canKeepPlace) {
      try {
        if (isInFavoritesView) {
          const sameKind = nextOrder.filter((key) => {
            if (key === toKey) return true;
            return entries.some(
              (entry) =>
                entry.relativePath === key && entry.isDirectory === renameEntry.isDirectory,
            );
          });
          await setFavoriteOrder(renameEntry.isDirectory ? 'folder' : 'file', sameKind);
        } else {
          await setFolderOrder(orderParentPath, nextOrder);
        }
        if (listSort.field !== 'custom') {
          setListSort(DEFAULT_CUSTOM_LIST_SORT);
        }
      } catch {
        // Rename already succeeded; keep the new name even if order persist fails.
      }
    }

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

  const handleMoveInto = async (dragged, destinationFolder) => {
    if (!destinationFolder?.isDirectory) return;
    const movingEntries = selectedSet.has(dragged.relativePath)
      ? selectedEntries.filter(
          (entry) =>
            !isOrderLocked(entry.relativePath) &&
            entry.relativePath !== destinationFolder.relativePath,
        )
      : [dragged];
    if (!movingEntries.length) return;
    try {
      await moveEntries(movingEntries, destinationFolder.relativePath);
      clearSelection();
      await refreshAll();
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '이동에 실패했습니다.');
    }
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
      target.isDirectory,
    );
    const normalized = parent === '.' ? uniqueName : joinRelativePath(parent, uniqueName);

    await copyTo(target.relativePath, normalized);
    await refreshAll();
  };

  const handleSetPassword = async (entry) => {
    const targets = entry ? getTargetEntries(entry) : selectedEntries;
    const files = targets.filter((item) => !item.isDirectory);
    if (!files.length) return;

    const canKeepPlace =
      !isInTrashView &&
      (isInFavoritesView
        ? isAdminLoggedIn
        : canChangeFolderOrder(currentPath, { isSuperAdmin, loginId: adminId }));
    const sortedAll = sortEntries(entries, listSort.field, listSort.direction, currentOrderNames, {
      pinWorkspaceRoots: !isInFavoritesView,
    });

    const results = files.every(canRemoveFilePassword)
      ? await removePasswordFromEntries(files)
      : await setPasswordOnEntries(files.filter(canSetFilePassword));

    if (canKeepPlace && results.length) {
      try {
        const pairs = results.map(({ from, to }) => ({
          fromKey: isInFavoritesView ? from : from.split('/').pop() || from,
          toKey: isInFavoritesView ? to : to.split('/').pop() || to,
        }));
        const nextOrder = folderOrderNamesAfterRenames(
          sortedAll,
          pairs,
          orderKeyOf,
          orderOptions,
        );
        if (isInFavoritesView) {
          const toKeys = new Set(pairs.map((pair) => pair.toKey));
          const sameKind = nextOrder.filter((key) => {
            if (toKeys.has(key)) return true;
            return entries.some((item) => item.relativePath === key && !item.isDirectory);
          });
          await setFavoriteOrder('file', sameKind);
        } else {
          await setFolderOrder(orderParentPath, nextOrder);
        }
        if (listSort.field !== 'custom') {
          setListSort(DEFAULT_CUSTOM_LIST_SORT);
        }
      } catch {
        // Password already applied; keep the file even if order persist fails.
      }
    }

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
      isSuperAdmin,
    );
    if (!canOpenFileForEdit(entry.relativePath, accessMap, isAdminLoggedIn, pathPerms)) {
      nativeAlert(
        !pathPerms.write && pathPerms.read === false
          ? GUEST_READ_DENIED_MESSAGE
          : VIEW_OPEN_DENIED_MESSAGE,
      );
      return;
    }
    const hit = docSearch.results.find((item) => item.relativePath === entry.relativePath);
    onOpenFile(
      withSearchOpenTarget(withHighlightQuery(entry, searchContents ? searchQuery : ''), {
        query: searchContents ? searchQuery : '',
        locationJson: hit?.locationJson ?? entry.locationJson,
        location: hit?.location ?? entry.searchLocation,
      }),
    );
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

  const handleToggleFavorite = async (entry, favorited) => {
    if (!entry) return;
    try {
      await setFavorite(entry.relativePath, favorited);
      await refreshAll();
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

  const canUseFileIndent =
    canWrite && !isInTrashView && !isInFavoritesView && typeof setFileLevels === 'function';

  const handleIndentFor = async (entry, delta) => {
    if (!canUseFileIndent || !entry || entry.isDirectory) return;
    try {
      await applyFileIndentDelta({
        entries: visibleEntries,
        entry,
        delta,
        levelMap: fileLevelMap,
        setFileLevels,
      });
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '파일 단계를 바꾸지 못했습니다.');
    }
  };

  const handleToggleCollapseFor = async (entry, nextCollapsed) => {
    if (!entry || entry.isDirectory) return;
    try {
      await setFileCollapsed(
        entry.relativePath,
        nextCollapsed ?? !fileCollapsedMap[entry.relativePath],
      );
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '하위 파일 접기를 바꾸지 못했습니다.');
    }
  };

  const levelsCollapsed = areAllParentsCollapsed(visibleEntries, fileLevelMap, fileCollapsedMap);
  const canToggleLevels =
    canUseFileIndent && parentFilesWithChildren(visibleEntries, fileLevelMap).length > 0;

  const handleToggleAllLevels = async () => {
    const parents = parentFilesWithChildren(visibleEntries, fileLevelMap);
    if (!canUseFileIndent || parents.length === 0) return;
    try {
      await setFileCollapsedMany(
        parents.map((entry) => ({ path: entry.relativePath, collapsed: !levelsCollapsed })),
      );
    } catch (err) {
      nativeAlert(err instanceof Error ? err.message : '하위 파일 접기를 바꾸지 못했습니다.');
    }
  };

  const handleSelect = (entry, event) => {
    if (event.shiftKey && lastSelectedPath) {
      selectRange(lastSelectedPath, entry.relativePath);
    } else if (event.ctrlKey || event.metaKey) {
      toggleSelection(entry.relativePath);
    } else {
      selectOnly(entry.relativePath);
      if (isAudioOrVideoEntry(entry)) {
        if (touchUi) void handleOpen(entry);
        return;
      }
      if (touchUi || previewOpen || canPreviewEntry(entry)) {
        openPreviewFor(entry, { fromList: true });
      }
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
    if (entry && previewOpen && !isAudioOrVideoEntry(entry)) {
      openPreviewFor(entry, { fromList: true });
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
        onOpenContainingFolder:
          contextTarget && !contextTarget.isDirectory
            ? (entry) => onNavigate(getParentPath(entry.relativePath))
            : undefined,
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
        onSetPassword: () => handleSetPassword(contextTarget),
        canSetPassword: contextTargets.some((target) => canSetFilePassword(target) || canRemoveFilePassword(target)),
        passwordActionLabel: contextTargets.every(canRemoveFilePassword)
          ? '비밀번호 해제'
          : '비밀번호 설정',
        canExportHtml:
          contextTargets.length === 1 &&
          !contextTargets[0].isDirectory &&
          (isTiptapDocumentRelativePath(contextTargets[0].relativePath) ||
            /\.md$/i.test(contextTargets[0].relativePath)),
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
                isSuperAdmin,
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
              isSuperAdmin,
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
          : canWriteAtPath(contextTargetPath, adminId, isAdminLoggedIn, globalWrite, isSuperAdmin),
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
    previewOpen,
    closePreview,
    canUseFileIndent,
    handleIndentFor,
    handleToggleCollapseFor,
    fileIndentInfo,
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (
        isEditorOpen ||
        document.documentElement.classList.contains('wb4s-embed-mode') ||
        document.querySelector('.modal-dialog--editor')
      ) {
        return;
      }

      const h = keyHandlersRef.current;

      if (event.key === 'Escape' && h.previewOpen) {
        event.preventDefault();
        h.closePreview();
        return;
      }

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

      const listFocused = Boolean(document.querySelector('[data-explorer-list]')?.contains(target));
      const selected = h.selectedEntries?.[0];
      if (
        listFocused &&
        h.canUseFileIndent &&
        h.selectedEntries.length === 1 &&
        selected &&
        !selected.isDirectory
      ) {
        if (event.key === 'Tab') {
          event.preventDefault();
          void h.handleIndentFor(selected, event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === 'ArrowLeft' && h.fileIndentInfo?.[selected.relativePath]?.hasChildren) {
          event.preventDefault();
          void h.handleToggleCollapseFor(selected, true);
          return;
        }
        if (event.key === 'ArrowRight' && h.fileIndentInfo?.[selected.relativePath]?.hasChildren) {
          event.preventDefault();
          void h.handleToggleCollapseFor(selected, false);
          return;
        }
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
      <div className="flex h-8 shrink-0 flex-nowrap items-center gap-2 px-0.5">
        {typeof onToggleSidebar === 'function' ? (
          <button
            type="button"
            className="sidebar-toggle-btn"
            title={sidebarCollapsed ? '폴더 패널 펼치기' : '폴더 패널 접기'}
            aria-label={sidebarCollapsed ? '폴더 패널 펼치기' : '폴더 패널 접기'}
            aria-pressed={!sidebarCollapsed}
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
          </button>
        ) : null}
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={
            searchContents
              ? isAdminLoggedIn
                ? '본문·개인·공유폴더 색인 검색…'
                : '본문 검색…'
              : '현재 폴더에서 이름 검색…'
          }
          className="ml-auto h-8 w-[220px] shrink-0 rounded-md border border-nas-border bg-white px-3 text-[10pt] outline-none focus:border-nas-accent focus:ring-1 focus:ring-nas-accent"
        />
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10pt] text-nas-muted"
          title={
            isAdminLoggedIn
              ? '개인·공유폴더 Excel·한글·Word·슬라이드·PDF·TipTap·텍스트는 색인에서, 현재 폴더의 다른 문서는 바로 읽습니다. 왼쪽 검색은 이름만 찾습니다.'
              : '현재 폴더의 문서 내용까지 검색합니다 (txt·md·tiptap·hwpx·docx·xlsx·pdf 등). 외부폴더는 본문 검색에서 제외됩니다.'
          }
        >
          <input
            type="checkbox"
            checked={searchContents}
            onChange={(event) => setSearchContents(event.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-nas-accent"
          />
          본문 검색
        </label>
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10pt] text-nas-muted"
          title="주요 파일만 보여 줍니다. 폴더는 그대로 둡니다."
        >
          <input
            type="checkbox"
            checked={starOnly}
            onChange={(event) => setStarOnly(event.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-nas-accent"
          />
          주요 파일
        </label>
      </div>

      {usePersonalIndex && (
        <PersonalDocIndexBar
          variant="light"
          status={docSearch.status}
          error={docSearch.error}
          onReindex={docSearch.reindex}
          onStop={docSearch.stop}
        />
      )}

      {searchContents && searchQuery.trim() && (
        <div className="shrink-0 rounded-md border border-nas-accentBorder bg-nas-accentSoft px-4 py-1.5 text-xs text-nas-accentText">
          {usePersonalIndex
            ? [
                docSearch.searching ? '색인 검색 중…' : `색인 일치 ${new Set(docSearch.results.map((hit) => hit.relativePath)).size}개 파일`,
                contentSearch.searching
                  ? `현재 폴더 검사 ${contentSearch.scanned}/${contentSearch.total}`
                  : `현재 폴더 실시간 ${contentSearch.matchedPaths.size}건`,
              ].join(' · ')
            : contentSearch.searching
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
              className={`inline-flex ${touchUi ? 'h-11' : 'h-8'} shrink-0 items-center gap-1 rounded-md border border-nas-border bg-white px-2.5 text-[10pt] text-nas-text hover:bg-nas-sidebarHover`}
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
          {!loading && !showViewAccessDenied ? (
            <p
              className="ml-auto shrink-0 tabular-nums text-[10pt] text-nas-muted"
              title="이 폴더 바로 아래의 폴더·파일 수"
            >
              {`폴더 ${folderCounts.folders.toLocaleString('ko-KR')}개 · 파일 ${folderCounts.files.toLocaleString('ko-KR')}개`}
              {(searchQuery.trim() || starOnly) && visibleEntries.length !== folderCounts.total
                ? ` · 표시 ${visibleEntries.length.toLocaleString('ko-KR')}`
                : ''}
            </p>
          ) : null}
        </div>
      <FileExplorerToolbar
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
        onImportOnenote={
          isExternalFolderPath(currentPath) ? undefined : handleImportOnenoteClick
        }
        importingOnenote={importingOnenote}
        onClearExternalCaches={
          canClearOrphanCaches(currentPath, isSuperAdmin) &&
          (isExternalFolderPath(currentPath) || canWrite)
            ? handleClearExternalCaches
            : undefined
        }
        clearingExternalCaches={clearingExternalCaches}
        onClearFolderBackups={
          canClearFolderBackups(currentPath) ? handleClearFolderBackups : undefined
        }
        clearingFolderBackups={clearingFolderBackups}
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
          {favoritesView === 'folders'
            ? '폴더 즐겨찾기 · 등록한 폴더로 바로 이동할 수 있습니다. 로그인 후 위로/아래 또는 드래그로 순서를 바꿀 수 있습니다.'
            : '파일 즐겨찾기 · 등록한 문서를 한곳에서 열어볼 수 있습니다. 로그인 후 위로/아래 또는 드래그로 순서를 바꿀 수 있습니다.'}
        </div>
      )}

      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleUploadInput} />
      <input
        ref={onenoteInputRef}
        type="file"
        accept=".one,.onepkg"
        multiple
        hidden
        onChange={handleOnenoteInput}
      />

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showViewAccessDenied ? (
        <ViewAccessDeniedPanel isLoggedIn={isAdminLoggedIn} onLogin={() => openLogin()} />
      ) : (
        <FileList
          entries={listEntries}
          loading={loading}
          selectedSet={selectedSet}
          accessMap={accessMap}
          shareMap={shareMap}
          favoritesMap={favoritesMap}
          folderColorMap={folderColorMap}
          nameBoldMap={nameBoldMap}
          fileIndentInfo={fileIndentInfo}
          onToggleCollapse={(entry) => handleToggleCollapseFor(entry)}
          onOpen={handleOpen}
          onSelect={handleSelect}
          onToggleCheckbox={handleToggleCheckbox}
          onToggleSelectAll={() => toggleSelectAllVisible(listEntries)}
          onContextMenu={openContextMenu}
          onBackgroundClick={() => {
            clearSelection();
            closePreview();
          }}
          onShareLinkClick={handleShareLinkBadgeClick}
          onPropertiesClick={handleShowProperties}
          canReorder={canReorder}
          onReorder={handlePlaceOrder}
          canMoveInto={!isInTrashView && !isInFavoritesView && canWrite}
          onMoveInto={handleMoveInto}
          sortField={listSort.field}
          sortDirection={listSort.direction}
          onSort={handleListSort}
          canMoveOrderUp={
            canReorder &&
            selectedEntries.length === 1 &&
            !isOrderLocked(selectedEntries[0].relativePath) &&
            canMoveFolderOrder(
              entries,
              currentOrderNames,
              orderKeyOf(selectedEntries[0]),
              -1,
              orderKeyOf,
              orderOptions,
            )
          }
          canMoveOrderDown={
            canReorder &&
            selectedEntries.length === 1 &&
            !isOrderLocked(selectedEntries[0].relativePath) &&
            canMoveFolderOrder(
              entries,
              currentOrderNames,
              orderKeyOf(selectedEntries[0]),
              1,
              orderKeyOf,
              orderOptions,
            )
          }
          onMoveOrderUp={() => handleMoveOrderFor(selectedEntries[0], -1)}
          onMoveOrderDown={() => handleMoveOrderFor(selectedEntries[0], 1)}
          canIndent={canUseFileIndent}
          canIndentUp={Boolean(
            selectedEntries.length === 1 &&
              canIndentFileUp(visibleEntries, selectedEntries[0], fileLevelMap),
          )}
          canIndentDown={Boolean(
            selectedEntries.length === 1 &&
              canIndentFileDown(visibleEntries, selectedEntries[0], fileLevelMap),
          )}
          onIndentUp={() => handleIndentFor(selectedEntries[0], -1)}
          onIndentDown={() => handleIndentFor(selectedEntries[0], 1)}
          canToggleLevels={canToggleLevels}
          levelsCollapsed={levelsCollapsed}
          onToggleLevels={handleToggleAllLevels}
          showFavoriteLocation={isInFavoritesView}
          lockFixedOrder={!isInFavoritesView}
        />
      )}
        <FilePreviewPane
          entry={previewEntry}
          open={previewOpen}
          canView={canPreviewView(previewEntry)}
          highlightQuery={searchContents ? searchQuery : ''}
          onClose={closePreview}
          onOpenFull={handleOpen}
          onPreview={(next) => openPreviewFor(next)}
          previewAnchorPath={previewAnchorPath}
          folderColorMap={folderColorMap}
          nameBoldMap={nameBoldMap}
          fileLevelMap={fileLevelMap}
          fileCollapsedMap={fileCollapsedMap}
          onToggleCollapse={handleToggleCollapseFor}
        />
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
            isSuperAdmin,
          )}
          onChangeFolderColor={(color) => handleSetFolderColor(propertiesEntry, color)}
          nameBold={Boolean(nameBoldMap[propertiesEntry.relativePath])}
          canChangeNameBold={canWriteAtPath(
            propertiesEntry.relativePath,
            adminId,
            isAdminLoggedIn,
            globalWrite,
            isSuperAdmin,
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
    </div>
  );
}
