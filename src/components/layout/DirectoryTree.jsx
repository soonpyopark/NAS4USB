import { EXTERNAL_FOLDER, SHARED_FOLDER } from '../../../shared/constants.js';
import { HOMES_FOLDER } from '../../../shared/memberHomes.js';
import FileIcon from '../explorer/FileIcon.jsx';
import { displayEntryName } from '../../lib/fsPaths.js';

function isRootExpandableFolder(relativePath) {
  return (
    relativePath === SHARED_FOLDER ||
    relativePath === HOMES_FOLDER ||
    relativePath === EXTERNAL_FOLDER
  );
}

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
  folderColorMap = {},
  nameBoldMap = {},
}) {
  const isFolder = entry.isDirectory;
  const isExpanded = expandedPaths.has(entry.relativePath);
  const isLoading = loadingPaths.has(entry.relativePath);
  const isActive = currentPath === entry.relativePath;
  const isInActiveBranch =
    currentPath === entry.relativePath || currentPath.startsWith(`${entry.relativePath}/`);
  const isTopLevel = depth === 0;

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
        className={`flex w-full items-center gap-1 rounded-md text-left text-[10pt] transition-colors ${rowClass} ${
          isTopLevel ? 'px-3 py-2' : 'py-1.5 pr-2'
        }`}
        style={isTopLevel ? undefined : { paddingLeft: `${depth * 12}px` }}
        onClick={handleClick}
        onContextMenu={(event) => onContextMenu(event, entry)}
      >
        {isFolder && isRootExpandableFolder(entry.relativePath) ? (
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
        {isTopLevel ? null : (
          <FileIcon
            entry={entry}
            folderColor={folderColorMap[entry.relativePath]}
            nameBold={Boolean(nameBoldMap[entry.relativePath])}
            className={`h-4 w-4 shrink-0 ${isActive ? '!text-white' : ''}`}
          />
        )}
        <span className={`truncate ${isTopLevel || nameBoldMap[entry.relativePath] ? 'font-bold' : ''}`}>
          {displayEntryName(entry)}
        </span>
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
              folderColorMap={folderColorMap}
              nameBoldMap={nameBoldMap}
            />
          ))}
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
  onToggleExpand,
  onNavigate,
  onOpenFile,
  onContextMenu,
  onBackgroundContextMenu,
  viewAccessDenied = false,
  folderColorMap = {},
  nameBoldMap = {},
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-1 py-2"
      onContextMenu={(event) => onBackgroundContextMenu(event)}
    >
      {viewAccessDenied ? (
        <div className="space-y-3 px-3 py-3">
          <p className="text-[10pt] leading-relaxed text-slate-400">
            보기 권한이 없습니다.
          </p>
        </div>
      ) : rootEntries.length === 0 ? (
        <p className="px-3 py-2 text-[10pt] text-slate-500">폴더가 없습니다</p>
      ) : (
        rootEntries.map((entry, index) => (
          <div key={entry.relativePath}>
            <TreeNode
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
              folderColorMap={folderColorMap}
              nameBoldMap={nameBoldMap}
            />
            {index < rootEntries.length - 1 ? (
              <div className="mx-3 my-1.5 border-t border-dashed border-slate-500" role="separator" />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
