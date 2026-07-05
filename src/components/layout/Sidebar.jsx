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
import { useTrash } from '../../hooks/useTrash.js';
import { useFileDropZone } from '../../hooks/useFileDropZone.js';
import { useAdminAuthContext } from '../../context/AdminAuthContext.jsx';
import FileDropOverlay from '../common/FileDropOverlay.jsx';
import EditorUpdateButton from './EditorUpdateButton.jsx';
import {
  openShareLinkForEntry,
  revokeShareLinkForEntry,
} from '../../lib/shareLinkActions.js';
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
import { canOpenFileForEdit, VIEW_OPEN_DENIED_MESSAGE } from '../../lib/fileEditAccess.js';
import { downloadFileEntries } from '../../lib/downloadEntries.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { isTrashPath, isTrashSubfolder, TRASH_FOLDER } from '../../lib/trashPaths.js';
import {
  createFolderAtPath,
  createNewTypedFileAtPath,
  uploadFilesAtPath,
} from '../../lib/fsWriteActions.js';

export default function Sidebar({
  currentPath,
  fsRevision = 0,
  onNavigate,
  onOpenFile,
  onFsChanged,
  syncInfo,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const tree = useDirectoryTree(currentPath, fsRevision);
  const fs = useFileSystem(currentPath);
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();
  const { results: searchResults, searching, truncated, isActive: isSearchActive } = useFileSearch(
    searchQuery,
    fsRevision,
  );
  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();
  const { shareMap, refreshShareMap } = useShareLinks();
  const { accessMap, refreshAccessMap, setFileAccess } = useFileAccess();
  const { isAdminLoggedIn } = useAdminAuthContext();
  const { count: trashCount, refresh: refreshTrash } = useTrash(fsRevision);

  const isInTrashView = isTrashPath(currentPath);

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
  const skipRevisionRefreshRef = useRef(false);

  const notifyChange = async () => {
    await tree.refreshTree();
    await fs.refresh();
    await refreshShareMap();
    await refreshAccessMap();
    await refreshTrash();
    skipRevisionRefreshRef.current = true;
    onFsChanged?.();
  };

  useEffect(() => {
    if (fsRevision === 0) return;
    if (skipRevisionRefreshRef.current) {
      skipRevisionRefreshRef.current = false;
      return;
    }

    void tree.refreshTree();
    void fs.refresh();
    void refreshShareMap();
    void refreshAccessMap();
    void refreshTrash();
  }, [fsRevision, tree.refreshTree, fs.refresh, refreshShareMap, refreshAccessMap, refreshTrash]);

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
      window.alert(err instanceof Error ? err.message : '폴더를 만들 수 없습니다.');
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
      window.alert(err instanceof Error ? err.message : '새 파일을 만들 수 없습니다.');
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
      window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

  const { isFileDragOver, dropZoneProps } = useFileDropZone(
    (files) => handleUploadFiles(files, currentPath),
    { enabled: !isInTrashView },
  );

  const handleDownload = async (entry = downloadTarget) => {
    const target = entry && !entry.isDirectory ? entry : downloadTarget;
    if (!target) {
      window.alert('다운로드할 파일을 선택해 주세요.');
      return;
    }

    try {
      await downloadFileEntries([target]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '다운로드에 실패했습니다.');
    }
  };

  const getSiblingNames = async (targetPath) => {
    if (targetPath === currentPath) {
      return (tree.childrenMap[targetPath] ?? tree.rootEntries).map((entry) => entry.name);
    }

    const dirEntries = await window.educowork.fs.readDir(targetPath);
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

    const wasInTrashSubfolder = isTrashSubfolder(currentPath);
    if (wasInTrashSubfolder) {
      skipRevisionRefreshRef.current = true;
      onNavigate(TRASH_FOLDER);
    }

    await fs.emptyTrash();
    await tree.refreshTree();
    await refreshShareMap();
    await refreshAccessMap();
    await refreshTrash();
    onFsChanged?.();

    if (!wasInTrashSubfolder) {
      await fs.refresh();
    }
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
      window.alert(err instanceof Error ? err.message : '공개 설정 변경에 실패했습니다.');
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
      window.alert(err instanceof Error ? err.message : '열람 제한 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handlePropertiesShareChange = async (checked) => {
    if (!propertiesEntry) return;
    setPropertiesSaving(true);
    try {
      if (checked) {
        const result = await openShareLinkForEntry({
          entry: propertiesEntry,
          syncInfo,
          shareMap,
          refreshShareMap,
        });
        setShareLinkDialog(result);
      } else {
        await revokeShareLinkForEntry({ entry: propertiesEntry, refreshShareMap });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '공유 설정 변경에 실패했습니다.');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handleShareLinkRevoke = async () => {
    if (!shareLinkDialog?.entry) return;
    await revokeShareLinkForEntry({ entry: shareLinkDialog.entry, refreshShareMap });
  };

  const handleOpen = (entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.relativePath);
      return;
    }
    if (isInTrashView || entry.relativePath.startsWith(`${TRASH_FOLDER}/`)) {
      window.alert('휴지통에 있는 파일은 복원한 뒤 열어 주세요.');
      return;
    }
    if (!canOpenFileForEdit(entry.relativePath, accessMap, isAdminLoggedIn)) {
      window.alert(VIEW_OPEN_DENIED_MESSAGE);
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
      ? resolveFileEntryStatus(propertiesEntry.relativePath, accessMap, shareMap)
      : null;

  const contextItems = contextTarget
    ? buildEntryContextMenuItems({
        entry: contextTarget,
        targetCount: 1,
        isInTrashView,
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
          ? canOpenFileForEdit(contextTarget.relativePath, accessMap, isAdminLoggedIn)
          : false,
        isAdminLoggedIn,
      })
    : buildBackgroundContextMenuItems({
        targetPath: contextTargetPath,
        isInTrashView,
        hasClipboard,
        onCreateFolder: () => openCreateFolderDialog(contextTargetPath),
        onCreateFile: () => openCreateFileDialog(contextTargetPath),
        onUpload: () => triggerUpload(contextTargetPath),
        onPaste: () => handlePaste(contextTargetPath),
        onRefresh: notifyChange,
        onEmptyTrash: handleEmptyTrash,
        isAdminLoggedIn,
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

      <div className="mt-auto border-t border-slate-700 px-2 py-2">
        <button
          type="button"
          onClick={() => onNavigate(TRASH_FOLDER)}
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
            currentPath === TRASH_FOLDER || currentPath.startsWith(`${TRASH_FOLDER}/`)
              ? 'bg-nas-accent text-white'
              : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
          }`}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm3 0h2v9h-2V9zM6 9h2v9H6V9z" />
          </svg>
          <span className="truncate">휴지통</span>
          {trashCount > 0 && (
            <span className="ml-auto rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-100">
              {trashCount}
            </span>
          )}
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
          onChangeShare={handlePropertiesShareChange}
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
