import { useEffect, useRef, useState } from 'react';
import ContextMenu from '../explorer/ContextMenu.jsx';
import FilePropertiesDialog from '../explorer/FilePropertiesDialog.jsx';
import NewFileDialog from '../explorer/NewFileDialog.jsx';
import NewFolderDialog from '../explorer/NewFolderDialog.jsx';
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
import { downloadFileEntries } from '../../lib/downloadEntries.js';
import { moveEntries } from '../../lib/moveEntries.js';
import { isTrashPath, TRASH_FOLDER } from '../../lib/trashPaths.js';
import AppLogo from '../common/AppLogo.jsx';
import { APP_NAME_LONG } from '../../../shared/constants.js';

export default function Sidebar({
  currentPath,
  fsRevision = 0,
  onNavigate,
  onOpenFile,
  onFsChanged,
  syncInfo,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const tree = useDirectoryTree(currentPath);
  const fs = useFileSystem(currentPath);
  const { confirm: appConfirm, alert: appAlert, dialog: confirmDialog } = useAppConfirm();
  const { results: searchResults, searching, truncated, isActive: isSearchActive } = useFileSearch(
    searchQuery,
    fsRevision,
  );
  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();
  const { shareMap, refreshShareMap } = useShareLinks();
  const { accessMap, refreshAccessMap, setFileAccess } = useFileAccess();
  const { count: trashCount, refresh: refreshTrash } = useTrash(fsRevision);

  const isInTrashView = isTrashPath(currentPath);

  const [contextMenu, setContextMenu] = useState(null);
  const [propertiesEntry, setPropertiesEntry] = useState(null);
  const [propertiesStat, setPropertiesStat] = useState(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareLinkDialog, setShareLinkDialog] = useState(null);
  const [moveDialogEntries, setMoveDialogEntries] = useState(null);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadInputRef = useRef(null);
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
  }, [fsRevision, tree.refreshTree, fs.refresh, refreshShareMap, refreshAccessMap]);

  const handleCreateFolder = () => {
    setNewFolderDialogOpen(true);
  };

  const handleCreateFolderConfirm = async (name) => {
    await fs.createFolder(name);
    await tree.expandPath(currentPath);
    await notifyChange();
  };

  const handleCreateFile = () => {
    setNewFileDialogOpen(true);
  };

  const handleCreateTypedFile = async (type) => {
    setNewFileDialogOpen(false);
    try {
      await fs.createNewTypedFile(type);
      await tree.expandPath(currentPath);
      await notifyChange();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '새 파일을 만들 수 없습니다.');
    }
  };

  const handleUploadFiles = async (files) => {
    try {
      await fs.uploadFiles(files);
      await tree.expandPath(currentPath);
      await notifyChange();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

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
    const existingNames = await getSiblingNames(targetPath);
    const pasted = await pasteEntries(targetPath, existingNames);
    if (pasted) {
      if (targetPath !== '.') {
        await tree.expandPath(getParentPath(targetPath));
      }
      await tree.expandPath(targetPath);
      await notifyChange();
    }
  };

  const handleRename = async (entry) => {
    const nextName = window.prompt('새 이름', entry.name);
    if (!nextName?.trim() || nextName.trim() === entry.name) return;

    const parent = getParentPath(entry.relativePath);
    const normalized = parent === '.' ? nextName.trim() : joinRelativePath(parent, nextName.trim());

    await fs.rename(entry.relativePath, normalized);
    await notifyChange();
    if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
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
    await fs.emptyTrash();
    await notifyChange();
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

  const handleOpen = (entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.relativePath);
      return;
    }
    if (isInTrashView || entry.relativePath.startsWith(`${TRASH_FOLDER}/`)) {
      window.alert('휴지통에 있는 파일은 복원한 뒤 열어 주세요.');
      return;
    }
    onOpenFile(entry);
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
        onCopy: () => copyEntries([contextTarget]),
        onCut: () => cutEntries([contextTarget]),
        onMove: () => handleMove(contextTarget),
        onPaste: handlePaste,
        onRename: () => handleRename(contextTarget),
        onDuplicate: () => handleDuplicate(contextTarget),
        onDelete: () => handleDelete(contextTarget),
        onRestore: () => handleRestore(contextTarget),
        onPermanentDelete: () => handlePermanentDelete(contextTarget),
        onProperties: () => handleShowProperties(contextTarget),
        onDownload: () => handleDownload(contextTarget),
        canDownload: Boolean(contextTarget && !contextTarget.isDirectory),
      })
    : buildBackgroundContextMenuItems({
        targetPath: contextTargetPath,
        isInTrashView,
        hasClipboard,
        onCreateFolder: handleCreateFolder,
        onCreateFile: handleCreateFile,
        onUpload: () => uploadInputRef.current?.click(),
        onPaste: handlePaste,
        onRefresh: notifyChange,
        onEmptyTrash: handleEmptyTrash,
      });

  return (
    <aside
      className={`flex w-full min-w-0 flex-1 flex-col bg-nas-sidebar text-slate-200 md:w-72 md:flex-none md:shrink-0 ${isDragging ? 'ring-2 ring-inset ring-nas-accent' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setIsDragging(false);
        const files = Array.from(event.dataTransfer.files ?? []);
        if (files.length) await handleUploadFiles(files);
      }}
    >
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-3">
        <AppLogo size={28} />
        <span className="truncate text-sm font-semibold text-white">{APP_NAME_LONG}</span>
      </div>

      <SidebarToolbar
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onUpload={() => uploadInputRef.current?.click()}
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
          className="h-8 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-[10pt] text-slate-100 placeholder:text-slate-500 outline-none focus:border-nas-accent"
        />
      </div>

      {isSearchActive ? (
        <FileSearchResults
          results={searchResults}
          searching={searching}
          truncated={truncated}
          currentPath={currentPath}
          onNavigate={onNavigate}
          onOpenFile={onOpenFile}
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
            onOpenFile={onOpenFile}
            onContextMenu={openContextMenu}
            onBackgroundContextMenu={(event) => openContextMenu(event, null, currentPath)}
          />
        </div>
      )}

      {isDragging && (
        <div className="border-t border-nas-accent bg-slate-800 px-3 py-2 text-center text-xs text-sky-300">
          여기에 파일을 놓으면 업로드
        </div>
      )}

      <div className="mt-auto border-t border-slate-700 px-2 py-2">
        <button
          type="button"
          onClick={() => onNavigate(TRASH_FOLDER)}
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

      <div className="border-t border-slate-700 px-4 py-3 text-xs text-slate-400">USB 포터블 모드</div>

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

      {contextMenu && (
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

      <ShareLinkModal
        open={Boolean(shareLinkDialog)}
        url={shareLinkDialog?.url ?? ''}
        fileName={shareLinkDialog?.fileName}
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
