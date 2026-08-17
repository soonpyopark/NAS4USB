import EntryMenuButton from '../explorer/EntryMenuButton.jsx';
import FileIcon from '../explorer/FileIcon.jsx';
import { displayEntryName, getParentPath } from '../../lib/fsPaths.js';
import { HOMES_FOLDER, isMemberHomeRootPath } from '../../lib/memberHomes.js';

function formatParentPath(relativePath) {
  const parent = getParentPath(relativePath);
  if (parent === '.') return '워크스페이스';
  if (isMemberHomeRootPath(parent)) return HOMES_FOLDER;
  return parent.replace(/\\/g, '/');
}

export default function FileSearchResults({
  results,
  searching,
  truncated,
  currentPath,
  onNavigate,
  onOpenFile,
  onContextMenu,
  folderColorMap = {},
  nameBoldMap = {},
}) {
  if (searching && results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-6 text-[10pt] text-slate-400">
        검색 중…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-6 text-[10pt] text-slate-500">
        검색 결과 없음
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
      {truncated && (
        <p className="px-3 py-1 text-[10pt] text-slate-500">결과가 많아 일부만 표시합니다 (최대 200건)</p>
      )}

      {results.map((entry) => {
        const isActive = currentPath === entry.relativePath;
        const parentLabel = formatParentPath(entry.relativePath);
        const label = displayEntryName(entry);

        return (
          <div
            key={entry.relativePath}
            className={`mb-0.5 flex w-full items-start gap-1 rounded-md px-2 py-1.5 text-[10pt] ${
              isActive
                ? 'bg-nas-accent text-white'
                : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
            }`}
            onContextMenu={(event) => onContextMenu(event, entry)}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left"
              onClick={() => {
                if (entry.isDirectory) {
                  onNavigate(entry.relativePath);
                  return;
                }
                onOpenFile(entry);
              }}
            >
              <FileIcon
                entry={entry}
                folderColor={folderColorMap[entry.relativePath]}
                nameBold={Boolean(nameBoldMap[entry.relativePath])}
                className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? '!text-white' : ''}`}
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${nameBoldMap[entry.relativePath] ? 'font-bold' : 'font-medium'}`}>
                  {label}
                </span>
                <span className={`block truncate text-[10pt] ${isActive ? 'text-white/75' : 'text-slate-500'}`}>
                  {parentLabel}
                </span>
              </span>
            </button>
            <EntryMenuButton
              label={label}
              onOpen={(event) => onContextMenu(event, entry)}
              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                isActive ? 'text-white/90 hover:bg-white/15' : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
