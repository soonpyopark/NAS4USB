import { useMemo } from 'react';
import FileIcon from '../explorer/FileIcon.jsx';
import { filterEntries } from '../../lib/fsPaths.js';

function Chevron({ expanded, loading }) {
  if (loading) {
    return <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-slate-500" />;
  }

  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
    </svg>
  );
}

function TreeNode({
  entry,
  depth,
  currentPath,
  expandedPaths,
  loadingPaths,
  childrenMap,
  onToggleExpand,
  onNavigate,
  onOpenFile,
  onContextMenu,
}) {
  const isFolder = entry.isDirectory;
  const isExpanded = expandedPaths.has(entry.relativePath);
  const isLoading = loadingPaths.has(entry.relativePath);
  const isActive = currentPath === entry.relativePath;
  const isInActiveBranch =
    currentPath !== '.' &&
    (currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`));

  const children = childrenMap[entry.relativePath] ?? [];

  const rowClass = isActive
    ? 'bg-nas-accent text-white'
    : isInActiveBranch
      ? 'bg-nas-sidebarHover text-white'
      : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white';

  const handleClick = () => {
    if (isFolder) {
      onNavigate(entry.relativePath);
      onToggleExpand(entry.relativePath);
      return;
    }
    onOpenFile(entry);
  };

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${rowClass}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(event) => onContextMenu(event, entry)}
      >
        {isFolder ? (
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(entry.relativePath);
            }}
          >
            <Chevron expanded={isExpanded} loading={isLoading && !children.length} />
          </span>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}
        <FileIcon entry={entry} className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : ''}`} />
        <span className="truncate">{entry.name}</span>
      </button>

      {isFolder && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.relativePath}
              entry={child}
              depth={depth + 1}
              currentPath={currentPath}
              expandedPaths={expandedPaths}
              loadingPaths={loadingPaths}
              childrenMap={childrenMap}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
            />
          ))}
          {!isLoading && children.length === 0 && (
            <p
              className="py-1 text-xs text-slate-500"
              style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}
            >
              비어 있음
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DirectoryTree({
  currentPath,
  rootEntries,
  childrenMap,
  expandedPaths,
  loadingPaths,
  searchQuery,
  onToggleExpand,
  onNavigate,
  onOpenFile,
  onContextMenu,
  onBackgroundContextMenu,
}) {
  const visibleRootEntries = useMemo(
    () => filterEntries(rootEntries, searchQuery),
    [rootEntries, searchQuery],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2" onContextMenu={onBackgroundContextMenu}>
      <button
        type="button"
        className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          currentPath === '.'
            ? 'bg-nas-accent text-white'
            : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
        }`}
        onClick={() => onNavigate('.')}
        onContextMenu={onBackgroundContextMenu}
      >
        <FileIcon
          entry={{ isDirectory: true, name: 'data', extension: null }}
          className={`h-4 w-4 shrink-0 ${currentPath === '.' ? 'text-white' : 'text-amber-400'}`}
        />
        <span className="truncate font-medium">data</span>
      </button>

      {visibleRootEntries.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">
          {searchQuery ? '검색 결과 없음' : '폴더가 없습니다'}
        </p>
      ) : (
        visibleRootEntries.map((entry) => (
          <TreeNode
            key={entry.relativePath}
            entry={entry}
            depth={0}
            currentPath={currentPath}
            expandedPaths={expandedPaths}
            loadingPaths={loadingPaths}
            childrenMap={childrenMap}
            onToggleExpand={onToggleExpand}
            onNavigate={onNavigate}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ))
      )}
    </div>
  );
}
