import FileIcon from './FileIcon.jsx';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FileList({
  entries,
  loading,
  viewMode,
  selectedSet,
  onOpen,
  onSelect,
  onContextMenu,
  onBackgroundClick,
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-nas-muted">
        불러오는 중…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <button
        type="button"
        className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-nas-muted"
        onClick={onBackgroundClick}
      >
        <p>폴더가 비어 있습니다.</p>
        <p className="text-xs">업로드, 새 폴더/파일, 붙여넣기, 또는 파일을 끌어다 놓으세요.</p>
      </button>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div
        className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 overflow-y-auto p-4"
        onClick={(event) => {
          if (event.currentTarget === event.target) onBackgroundClick();
        }}
      >
        {entries.map((entry) => {
          const selected = selectedSet.has(entry.relativePath);

          return (
            <button
              key={entry.relativePath}
              type="button"
              className={`group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors ${
                selected
                  ? 'border-nas-accent bg-blue-50'
                  : 'border-transparent hover:border-nas-border hover:bg-slate-50'
              }`}
              onClick={(event) => onSelect(entry, event)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(event) => onContextMenu(event, entry)}
            >
              <FileIcon entry={entry} className="h-12 w-12" />
              <span className="line-clamp-2 w-full text-xs text-slate-700">{entry.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onClick={(event) => {
        if (event.currentTarget === event.target) onBackgroundClick();
      }}
    >
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-nas-muted">
          <tr>
            <th className="px-4 py-2 font-medium">이름</th>
            <th className="hidden px-4 py-2 font-medium md:table-cell">수정일</th>
            <th className="hidden px-4 py-2 font-medium sm:table-cell">크기</th>
            <th className="hidden px-4 py-2 font-medium lg:table-cell">종류</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const selected = selectedSet.has(entry.relativePath);

            return (
              <tr
                key={entry.relativePath}
                className={`cursor-pointer border-t border-nas-border ${
                  selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
                onClick={(event) => onSelect(entry, event)}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(event) => onContextMenu(event, entry)}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <FileIcon entry={entry} className="h-5 w-5 shrink-0" />
                    <span className="truncate font-medium text-slate-700">{entry.name}</span>
                  </div>
                </td>
                <td className="hidden px-4 py-2 text-nas-muted md:table-cell">
                  {formatDate(entry.modifiedAt)}
                </td>
                <td className="hidden px-4 py-2 text-nas-muted sm:table-cell">
                  {entry.isDirectory ? '—' : formatSize(entry.size)}
                </td>
                <td className="hidden px-4 py-2 text-nas-muted lg:table-cell">
                  {entry.isDirectory ? '폴더' : entry.extension?.toUpperCase() || '파일'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
