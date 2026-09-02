import { HOMES_FOLDER } from '../../lib/memberHomes.js';
import { useExternalFolders } from '../../hooks/useExternalFolders.js';
import { formatBreadcrumbSegment } from '../../lib/trashPaths.js';

function splitPath(relativePath) {
  if (relativePath === '.') return [];
  return relativePath.split('/').filter(Boolean);
}

/**
 * Hide `개인폴더/{loginId}` so home contents look like 2nd-level folders.
 * @param {string[]} segments
 */
function displayIndexes(segments) {
  if (segments[0] === HOMES_FOLDER && segments.length >= 2) {
    return [0, ...segments.slice(2).map((_, offset) => offset + 2)];
  }
  return segments.map((_, index) => index);
}

function realPathAt(segments, lastIndex) {
  if (segments[0] === HOMES_FOLDER && lastIndex === 0) return HOMES_FOLDER;
  return segments.slice(0, lastIndex + 1).join('/');
}

export default function Breadcrumb({ currentPath, onNavigate }) {
  const externalFolders = useExternalFolders();
  const segments = splitPath(currentPath);
  const indexes = displayIndexes(segments);

  if (segments.length === 0) {
    return (
      <nav aria-label="경로" className="flex min-w-0 flex-wrap items-center gap-1 text-[10pt]">
        <span className="truncate font-medium text-slate-700">워크스페이스</span>
      </nav>
    );
  }

  return (
    <nav aria-label="경로" className="flex min-w-0 flex-wrap items-center gap-1 text-[10pt]">
      {indexes.map((segmentIndex, displayIndex) => {
        const path = realPathAt(segments, segmentIndex);
        const isLast = displayIndex === indexes.length - 1;
        const label = formatBreadcrumbSegment(segments[segmentIndex], {
          path,
          externalFolders,
        });

        return (
          <span key={path} className="flex min-w-0 items-center gap-1">
            {displayIndex > 0 ? (
              <span className="shrink-0 text-nas-muted" aria-hidden="true">
                /
              </span>
            ) : null}
            {isLast ? (
              <span className="truncate px-1.5 py-0.5 font-medium text-slate-700">{label}</span>
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
