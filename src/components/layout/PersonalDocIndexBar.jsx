function formatBuiltAt(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}. ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatScope(label, scope) {
  const folders = Number(scope?.folderCount ?? 0).toLocaleString();
  const files = Number(scope?.fileCount ?? 0).toLocaleString();
  return `${label}(폴더 ${folders}개, 파일 ${files}개)`;
}

export default function PersonalDocIndexBar({
  status,
  error,
  variant = 'dark',
  onReindex,
  onStop,
}) {
  const running = status?.status === 'running';
  const progress = status?.progress;
  const isDark = variant === 'dark';
  const builtAt = formatBuiltAt(status?.builtAt || status?.job?.updatedAt || status?.job?.startedAt);
  const buttonClass =
    'h-8 shrink-0 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-nas-accentHover';

  const summary = [
    formatScope('공유폴더', status?.scopes?.share),
    formatScope('개인폴더', status?.scopes?.personal),
    builtAt ? `생성일시(${builtAt})` : null,
    status?.errorCount ? `실패 ${Number(status.errorCount).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <div
      className={
        isDark
          ? 'flex items-center gap-1 border-b border-slate-700 px-2 py-1.5 text-[10pt] text-slate-400'
          : 'flex items-center gap-2 rounded-md border border-nas-accentBorder bg-nas-accentSoft px-3 py-1.5 text-xs text-nas-accentText'
      }
    >
      <span className="min-w-0 flex-1 truncate">
        {error
          ? error
          : running
            ? `인덱싱 중 ${progress?.current ?? 0}/${progress?.total ?? 0}${
                progress?.fileName ? ` · ${progress.fileName}` : ''
              }`
            : summary}
      </span>
      {running ? (
        <button type="button" className={buttonClass} onClick={onStop}>
          중지
        </button>
      ) : (
        <button type="button" className={buttonClass} onClick={() => onReindex({ reset: true })}>
          색인 생성
        </button>
      )}
    </div>
  );
}
