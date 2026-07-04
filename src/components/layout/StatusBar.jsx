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
        {paths?.tempPath && (
          <span className="ml-3 hidden md:inline">temp: {paths.tempPath}</span>
        )}
      </span>
      <span className="hidden truncate pl-4 sm:inline">{lanHint}</span>
    </footer>
  );
}
