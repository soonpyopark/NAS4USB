import { useEffect, useMemo, useRef, useState } from 'react';
import Breadcrumb from './Breadcrumb.jsx';
import ContextMenu from './ContextMenu.jsx';
import FileExplorerToolbar from './FileExplorerToolbar.jsx';
import FileList from './FileList.jsx';
import FilePropertiesDialog from './FilePropertiesDialog.jsx';
import NewFileDialog from './NewFileDialog.jsx';
import { useFileClipboard } from '../../hooks/useFileClipboard.js';
import { useFileSelection } from '../../hooks/useFileSelection.js';
import { useFileSystem } from '../../hooks/useFileSystem.js';
import {
  filterEntries,
  getParentPath,
  joinRelativePath,
  resolveUniqueName,
  sortEntries,
} from '../../lib/fsPaths.js';

export default function FileExplorer({ currentPath, onNavigate, onOpenFile, onFsChanged, fsRevision = 0 }) {
  const {
    entries,
    loading,
    error,
    refresh,
    mkdir,
    createFile,
    createNewTypedFile,
    remove,
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
  } = useFileSelection(entries);

  const { hasClipboard, copyEntries, cutEntries, pasteEntries } = useFileClipboard();

  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [contextMenu, setContextMenu] = useState(null);
  const [propertiesEntry, setPropertiesEntry] = useState(null);
  const [propertiesStat, setPropertiesStat] = useState(null);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSelectedPath, setLastSelectedPath] = useState(null);

  const uploadInputRef = useRef(null);
  const containerRef = useRef(null);

  const visibleEntries = useMemo(() => {
    const filtered = filterEntries(entries, searchQuery);
    return sortEntries(filtered, sortField, sortDirection);
  }, [entries, searchQuery, sortField, sortDirection]);

  const refreshAll = async () => {
    await refresh();
    onFsChanged?.();
  };

  useEffect(() => {
    clearSelection();
    setSearchQuery('');
    setContextMenu(null);
  }, [currentPath, clearSelection]);

  useEffect(() => {
    if (fsRevision > 0) {
      refresh();
    }
  }, [fsRevision, refresh]);

  const getTargetEntries = (entry) => {
    if (entry && selectedSet.has(entry.relativePath) && selectedEntries.length > 1) {
      return selectedEntries;
    }
    return entry ? [entry] : selectedEntries;
  };

  const handleNavigateUp = () => {
    onNavigate(getParentPath(currentPath));
  };

  const handleCreateFolder = async () => {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    await mkdir(name.trim());
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
      window.alert(err instanceof Error ? err.message : '새 파일을 만들 수 없습니다.');
    }
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadInput = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    try {
      await uploadFiles(files);
      await refreshAll();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

  const handleDropUpload = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;
    try {
      await uploadFiles(files);
      await refreshAll();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.');
    }
  };

  const handleRename = async (entry) => {
    const targets = entry ? getTargetEntries(entry) : selectedEntries;
    if (targets.length !== 1) {
      window.alert('이름을 변경할 항목 하나를 선택해 주세요.');
      return;
    }

    const target = targets[0];
    const nextName = window.prompt('새 이름', target.name);
    if (!nextName?.trim() || nextName.trim() === target.name) return;

    const parent = getParentPath(target.relativePath);
    const normalized =
      parent === '.' ? nextName.trim() : joinRelativePath(parent, nextName.trim());

    await rename(target.relativePath, normalized);
    clearSelection();
    await refreshAll();
  };

  const handleDelete = async (entry) => {
    const targets = getTargetEntries(entry);
    if (!targets.length) return;

    const confirmed = window.confirm(`${targets.length}개 항목을 삭제할까요?`);
    if (!confirmed) return;

    for (const target of targets) {
      await remove(target.relativePath);
    }
    clearSelection();
    await refreshAll();
  };

  const handleCopy = (entry) => {
    const targets = getTargetEntries(entry);
    copyEntries(targets);
  };

  const handleCut = (entry) => {
    const targets = getTargetEntries(entry);
    cutEntries(targets);
  };

  const handlePaste = async () => {
    const existingNames = entries.map((entry) => entry.name);
    const pasted = await pasteEntries(currentPath, existingNames);
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

  const handleOpen = (entry) => {
    if (entry.isDirectory) {
      onNavigate(entry.relativePath);
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

  const openContextMenu = (event, entry) => {
    event.preventDefault();
    if (entry && !selectedSet.has(entry.relativePath)) {
      selectOnly(entry.relativePath);
      setLastSelectedPath(entry.relativePath);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entry: entry ?? selectedEntries[0] ?? null,
    });
  };

  const contextTarget = contextMenu?.entry ?? selectedEntries[0] ?? null;
  const contextTargets = getTargetEntries(contextTarget);

  const contextItems = [
    {
      id: 'open',
      label: contextTarget?.isDirectory ? '열기' : '편집 / 열기',
      disabled: !contextTarget,
      onClick: () => contextTarget && handleOpen(contextTarget),
    },
    {
      id: 'open-system',
      label: '시스템에서 열기',
      disabled: !contextTarget || contextTarget.isDirectory,
      onClick: () => contextTarget && openInSystem(contextTarget.relativePath),
    },
    { id: 'copy', label: '복사', disabled: !contextTargets.length, onClick: () => handleCopy(contextTarget) },
    { id: 'cut', label: '잘라내기', disabled: !contextTargets.length, onClick: () => handleCut(contextTarget) },
    { id: 'paste', label: '붙여넣기', disabled: !hasClipboard, onClick: handlePaste },
    {
      id: 'rename',
      label: '이름 변경',
      disabled: contextTargets.length !== 1,
      onClick: () => handleRename(contextTarget),
    },
    {
      id: 'duplicate',
      label: '복제',
      disabled: !contextTarget,
      onClick: () => handleDuplicate(contextTarget),
    },
    {
      id: 'delete',
      label: '삭제',
      danger: true,
      disabled: !contextTargets.length,
      onClick: () => handleDelete(contextTarget),
    },
    {
      id: 'properties',
      label: '속성',
      disabled: !contextTarget,
      onClick: () => handleShowProperties(contextTarget),
    },
  ];

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (event.key === 'F5') {
        event.preventDefault();
        refreshAll();
      }
      if (event.key === 'Delete' && selectedEntries.length) {
        event.preventDefault();
        handleDelete();
      }
      if (event.key === 'F2' && selectedEntries.length === 1) {
        event.preventDefault();
        handleRename(selectedEntries[0]);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedEntries.length) {
        event.preventDefault();
        handleCopy();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x' && selectedEntries.length) {
        event.preventDefault();
        handleCut();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && hasClipboard) {
        event.preventDefault();
        handlePaste();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 flex-col ${isDragging ? 'bg-blue-50/60' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDropUpload}
      onContextMenu={(event) => openContextMenu(event, null)}
    >
      <div className="border-b border-nas-border px-4 py-3">
        <Breadcrumb currentPath={currentPath} onNavigate={onNavigate} />
      </div>

      <FileExplorerToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onToggleSortDirection={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hasSelection={selectedEntries.length > 0}
        hasClipboard={hasClipboard}
        onNavigateUp={handleNavigateUp}
        onRefresh={refreshAll}
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onUploadClick={handleUploadClick}
        onCopy={() => handleCopy()}
        onCut={() => handleCut()}
        onPaste={handlePaste}
        onDelete={() => handleDelete()}
        onRename={() => handleRename()}
        onSelectAll={selectAll}
      />

      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleUploadInput} />

      {isDragging && (
        <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-xs text-blue-700">
          파일을 여기에 놓으면 업로드됩니다
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <FileList
        entries={visibleEntries}
        loading={loading}
        viewMode={viewMode}
        selectedSet={selectedSet}
        onOpen={handleOpen}
        onSelect={handleSelect}
        onContextMenu={openContextMenu}
        onBackgroundClick={clearSelection}
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
    </div>
  );
}
