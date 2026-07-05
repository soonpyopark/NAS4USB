import { openExternalUrl } from '../../lib/openExternal.js';
import { APP_BLOG_URL } from '../../../shared/constants.js';

function formatPath(relativePath) {
  if (relativePath === '.') return '/';
  return `/${relativePath.replace(/\\/g, '/')}`;
}

export default function StatusBar({ paths, syncInfo, currentPath }) {
  const lanHint =
    syncInfo?.addresses?.length > 0
      ? syncInfo.addresses.map((addr) => `ws://${addr}:${syncInfo.port}`).join(' · ')
      : 'LAN 주소 없음';

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-nas-border bg-white px-4 text-xs text-nas-muted">
      <span className="truncate">
        {formatPath(currentPath)}
        {paths?.dataRoot && (
          <span className="ml-3 hidden lg:inline" title={paths.dataRoot}>
            data: {paths.dataRoot}
          </span>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-3 pl-4">
        <span className="hidden truncate sm:inline">{lanHint}</span>
        <button
          type="button"
          onClick={() => openExternalUrl(APP_BLOG_URL)}
          className="shrink-0 text-sky-600 transition-colors hover:text-sky-800 hover:underline"
          title={`브라우저에서 ${APP_BLOG_URL} 열기`}
        >
          {APP_BLOG_URL}
        </button>
      </div>
    </footer>
  );
}
