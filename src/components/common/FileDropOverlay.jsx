/**
 * @param {{ message?: string, variant?: 'light' | 'dark' }} props
 */
export default function FileDropOverlay({ message = '파일을 여기에 놓으면 업로드됩니다', variant = 'light' }) {
  const isDark = variant === 'dark';

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center ${
        isDark ? 'bg-slate-900/55' : 'bg-blue-50/35'
      }`}
      aria-hidden="true"
    >
      <div
        className={`rounded-lg border border-dashed px-5 py-3 text-center text-sm shadow-sm ${
          isDark
            ? 'border-sky-400/70 bg-slate-800/95 text-sky-200'
            : 'border-nas-accent/50 bg-white/95 text-blue-700'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
