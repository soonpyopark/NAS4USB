export default function ViewerModal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-nas-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
            {subtitle && <p className="truncate text-xs text-nas-muted">{subtitle}</p>}
          </div>

          <button type="button" className="nas-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
