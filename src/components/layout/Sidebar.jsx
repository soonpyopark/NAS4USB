import { useEffect, useRef, useState } from 'react';
import ContextMenu from '../explorer/ContextMenu.jsx';
import FilePropertiesDialog from '../explorer/FilePropertiesDialog.jsx';
import NewFileDialog from '../explorer/NewFileDialog.jsx';
import DirectoryTree from './DirectoryTree.jsx';
import SidebarToolbar from './SidebarToolbar.jsx';
import { useDirectoryTree } from '../../hooks/useDirectoryTree.js';
import { useFileClipboard } from '../../hooks/useFileClipboard.js';
import { useFileSystem } from '../../hooks/useFileSystem.js';
import {
  getParentPath,
  joinRelativePath,
  resolveUniqueName,
} from '../../lib/fsPaths.js';

export default function Sidebar({
  currentPath,
  onNavigate,
  onOpenFile,
  onFsChanged,
}) {
  const tree = useDirectoryTree(currentPath);
  const fs = useFileSystem(currentPath);
  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();

  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [propertiesEntry, setPropertiesEntry] = useState(null);
  const [propertiesStat, setPropertiesStat] = useState(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const uploadInputRef = useRef(null);

  const notifyChange = async () => {
    await tree.refreshTree();
    await fs.refresh();
    onFsChanged?.();
  };

  useEffect(() => {
    setSearchQuery('');
  }, [currentPath]);

  const handleCreateFolder = async () => {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    await fs.mkdir(name.trim());
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

  const handlePaste = async (targetPath = currentPath) => {
    const entries = tree.childrenMap[targetPath] ?? tree.rootEntries;
    const pasted = await pasteEntries(targetPath, entries.map((entry) => entry.name));
    if (pasted) await notifyChange();
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
    const confirmed = window.confirm(`"${entry.name}"을(를) 삭제할까요?`);
    if (!confirmed) return;
    await fs.remove(entry.relativePath);
    if (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`)) {
      onNavigate(getParentPath(entry.relativePath));
    }
    await notifyChange();
  };

  const handleDuplicate = async (entry) => {
    const parent = getParentPath(entry.relativePath);
    const siblingNames = (tree.childrenMap[parent === '.' ? '.' : parent] ?? tree.rootEntries).map(
      (item) => item.name,
    );
    const uniqueName = resolveUniqueName(siblingNames, entry.name);
    const destination = parent === '.' ? uniqueName : joinRelativePath(parent, uniqueName);
    await fs.copyTo(entry.relativePath, destination);
    await notifyChange();
  };

  const handleShowProperties = async (entry) => {
    const info = await fs.stat(entry.relativePath);
    setPropertiesEntry(entry);
    setPropertiesStat(info);
  };

  const openContextMenu = (event, entry, targetPath = currentPath) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, entry, targetPath });
  };

  const contextTarget = contextMenu?.entry;
  const contextTargetPath = contextMenu?.targetPath ?? currentPath;

  const contextItems = contextTarget
    ? [
        {
          id: 'open',
          label: contextTarget.isDirectory ? '폴더 열기' : '파일 열기',
          onClick: () =>
            contextTarget.isDirectory ? onNavigate(contextTarget.relativePath) : onOpenFile(contextTarget),
        },
        {
          id: 'open-system',
          label: '시스템에서 열기',
          disabled: contextTarget.isDirectory,
          onClick: () => fs.openInSystem(contextTarget.relativePath),
        },
        { id: 'copy', label: '복사', onClick: () => copyEntries([contextTarget]) },
        { id: 'cut', label: '잘라내기', onClick: () => cutEntries([contextTarget]) },
        {
          id: 'paste',
          label: '붙여넣기',
          disabled: !hasClipboard || !contextTarget.isDirectory,
          onClick: () => handlePaste(contextTarget.relativePath),
        },
        { id: 'rename', label: '이름 변경', onClick: () => handleRename(contextTarget) },
        { id: 'duplicate', label: '복제', onClick: () => handleDuplicate(contextTarget) },
        { id: 'delete', label: '삭제', danger: true, onClick: () => handleDelete(contextTarget) },
        { id: 'properties', label: '속성', onClick: () => handleShowProperties(contextTarget) },
      ]
    : [
        { id: 'newfolder', label: '새 폴더', onClick: handleCreateFolder },
        { id: 'newfile', label: '새 파일', onClick: handleCreateFile },
        { id: 'upload', label: '업로드', onClick: () => uploadInputRef.current?.click() },
        {
          id: 'paste',
          label: '붙여넣기',
          disabled: !hasClipboard,
          onClick: () => handlePaste(contextTargetPath),
        },
        { id: 'refresh', label: '새로고침', onClick: notifyChange },
      ];

  return (
    <aside
      className={`flex w-72 shrink-0 flex-col bg-nas-sidebar text-slate-200 ${isDragging ? 'ring-2 ring-inset ring-nas-accent' : ''}`}
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
      <div className="border-b border-slate-700 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nas-accent text-sm font-bold text-white">
            EC
          </div>
          <div>
            <p className="text-sm font-semibold text-white">EduCowork</p>
            <p className="text-xs text-slate-400">폴더 · 파일</p>
          </div>
        </div>
      </div>

      <SidebarToolbar
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onUpload={() => uploadInputRef.current?.click()}
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
          placeholder="트리 검색…"
          className="h-8 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-nas-accent"
        />
      </div>

      <DirectoryTree
        currentPath={currentPath}
        rootEntries={tree.rootEntries}
        childrenMap={tree.childrenMap}
        expandedPaths={tree.expandedPaths}
        loadingPaths={tree.loadingPaths}
        searchQuery={searchQuery}
        onToggleExpand={tree.toggleExpand}
        onNavigate={onNavigate}
        onOpenFile={onOpenFile}
        onContextMenu={openContextMenu}
        onBackgroundContextMenu={(event) => openContextMenu(event, null, currentPath)}
      />

      {isDragging && (
        <div className="border-t border-nas-accent bg-slate-800 px-3 py-2 text-center text-xs text-sky-300">
          여기에 파일을 놓으면 업로드
        </div>
      )}

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
    </aside>
  );
}
