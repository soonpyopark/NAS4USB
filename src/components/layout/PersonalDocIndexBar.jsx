import { useEffect, useRef, useState } from 'react';

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
  const [createOpen, setCreateOpen] = useState(false);
  const [includeShare, setIncludeShare] = useState(true);
  const [includePersonal, setIncludePersonal] = useState(true);
  const createRef = useRef(null);
  const running = status?.status === 'running';
  const progress = status?.progress;
  const isDark = variant === 'dark';
  const builtAt = formatBuiltAt(status?.builtAt || status?.job?.updatedAt || status?.job?.startedAt);
  const buttonClass =
    'h-8 shrink-0 rounded-md bg-nas-accent px-2.5 text-[10pt] font-medium text-white transition-colors hover:bg-nas-accentHover';
  const popoverClass = isDark
    ? 'absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-slate-600 bg-slate-800 p-3 text-[10pt] text-slate-200 shadow-lg'
    : 'absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-nas-border bg-white p-3 text-[10pt] text-nas-text shadow-lg';

  const summary = [
    formatScope('공유폴더', status?.scopes?.share),
    formatScope('개인폴더', status?.scopes?.personal),
    builtAt ? `생성일시(${builtAt})` : null,
    status?.errorCount ? `실패 ${Number(status.errorCount).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  useEffect(() => {
    if (!createOpen) return undefined;
    const onPointerDown = (event) => {
      if (createRef.current && !createRef.current.contains(event.target)) {
        setCreateOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCreateOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [createOpen]);

  useEffect(() => {
    if (running) setCreateOpen(false);
  }, [running]);

  const startCreate = () => {
    /** @type {Array<'share' | 'personal'>} */
    const scopes = [];
    if (includeShare) scopes.push('share');
    if (includePersonal) scopes.push('personal');
    if (!scopes.length) return;
    setCreateOpen(false);
    onReindex?.({ reset: true, scopes });
  };

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
        <div className="relative shrink-0" ref={createRef}>
          <button
            type="button"
            className={buttonClass}
            aria-expanded={createOpen}
            aria-haspopup="dialog"
            onClick={() => setCreateOpen((open) => !open)}
          >
            색인 생성 ▾
          </button>
          {createOpen ? (
            <div className={popoverClass} role="dialog" aria-label="색인 생성 범위">
              <p className="mb-2 font-medium">색인 범위</p>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeShare}
                  onChange={(event) => setIncludeShare(event.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-nas-accent"
                />
                공유폴더
              </label>
              <label className="mb-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePersonal}
                  onChange={(event) => setIncludePersonal(event.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-nas-accent"
                />
                개인폴더
              </label>
              <p className="mb-2 text-[9pt] opacity-80">
                폴더 속성에서 「색인생성 제외」한 항목은 건너뜁니다.
              </p>
              <button
                type="button"
                className={`${buttonClass} w-full`}
                disabled={!includeShare && !includePersonal}
                onClick={startCreate}
              >
                생성 시작
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
