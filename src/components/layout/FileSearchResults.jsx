import FileIcon from '../explorer/FileIcon.jsx';
import { getParentPath } from '../../lib/fsPaths.js';

function formatParentPath(relativePath) {
  const parent = getParentPath(relativePath);
  return parent === '.' ? 'data' : `data/${parent.replace(/\\/g, '/')}`;
}

export default function FileSearchResults({
  results,
  searching,
  truncated,
  currentPath,
  onNavigate,
  onOpenFile,
  onContextMenu,
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

        return (
          <button
            key={entry.relativePath}
            type="button"
            className={`mb-0.5 flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-[10pt] transition-colors ${
              isActive
                ? 'bg-nas-accent text-white'
                : 'text-slate-300 hover:bg-nas-sidebarHover hover:text-white'
            }`}
            onClick={() => {
              if (entry.isDirectory) {
                onNavigate(entry.relativePath);
                return;
              }
              onOpenFile(entry);
            }}
            onContextMenu={(event) => onContextMenu(event, entry)}
          >
            <FileIcon entry={entry} className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-white' : ''}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{entry.name}</span>
              <span className={`block truncate text-[10pt] ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                {parentLabel}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
