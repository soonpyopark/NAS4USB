/**
 * @param {number} seconds
 */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Full-length seek bar for remuxed HLS. Converted range is highlighted;
 * clicking past it restarts conversion from that time.
 *
 * @param {{
 *   currentTime: number,
 *   duration: number,
 *   startSeconds?: number,
 *   availableSeconds?: number,
 *   disabled?: boolean,
 *   onSeek: (seconds: number) => void,
 * }} props
 */
export default function VideoTimeline({
  currentTime,
  duration,
  startSeconds = 0,
  availableSeconds = 0,
  disabled = false,
  onSeek,
}) {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const convertedStart = Math.max(0, startSeconds);
  const convertedEnd = Math.min(duration, convertedStart + Math.max(0, availableSeconds));
  const playhead = Math.min(duration, Math.max(0, currentTime));

  const onBarClick = (event) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-2">
      <button
        type="button"
        className="relative block h-2 w-full overflow-hidden rounded-full bg-slate-700 disabled:opacity-60"
        disabled={disabled}
        onClick={onBarClick}
        aria-label="재생 위치"
      >
        <span
          className="absolute inset-y-0 bg-sky-900"
          style={{
            left: `${(convertedStart / duration) * 100}%`,
            width: `${((convertedEnd - convertedStart) / duration) * 100}%`,
          }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${(playhead / duration) * 100}%` }}
        />
      </button>
      <p className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{formatClock(playhead)}</span>
        <span>막대를 눌러 중간부터 재생 · 밝은 구간만 바로 이동</span>
        <span>{formatClock(duration)}</span>
      </p>
    </div>
  );
}
