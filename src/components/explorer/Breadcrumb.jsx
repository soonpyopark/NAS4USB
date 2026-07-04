function splitPath(relativePath) {
  if (relativePath === '.') return [];
  return relativePath.split('/').filter(Boolean);
}

export default function Breadcrumb({ currentPath, onNavigate }) {
  const segments = splitPath(currentPath);

  return (
    <nav aria-label="경로" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate('.')}
        className="rounded px-1.5 py-0.5 text-nas-accent hover:bg-blue-50"
      >
        홈
      </button>

      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1">
            <span className="text-nas-muted">/</span>
            {isLast ? (
              <span className="truncate font-medium text-slate-700">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(path)}
                className="truncate rounded px-1.5 py-0.5 text-nas-accent hover:bg-blue-50"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
