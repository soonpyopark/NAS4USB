import { formatBreadcrumbSegment } from '../../lib/trashPaths.js';

function splitPath(relativePath) {
  if (relativePath === '.') return [];
  return relativePath.split('/').filter(Boolean);
}

export default function Breadcrumb({ currentPath, onNavigate }) {
  const segments = splitPath(currentPath);

  if (segments.length === 0) {
    return (
      <nav aria-label="경로" className="flex min-w-0 flex-wrap items-center gap-1 text-[10pt]">
        <span className="truncate font-medium text-slate-700">워크스페이스</span>
      </nav>
    );
  }

  return (
    <nav aria-label="경로" className="flex min-w-0 flex-wrap items-center gap-1 text-[10pt]">
      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = formatBreadcrumbSegment(segment);

        return (
          <span key={path} className="flex items-center gap-1">
            {index > 0 ? <span className="text-nas-muted">/</span> : null}
            {isLast ? (
              <span className="truncate font-medium text-slate-700">{label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(path)}
                className="truncate rounded px-1.5 py-0.5 text-nas-accent hover:bg-nas-accentSoft"
              >
                {label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
