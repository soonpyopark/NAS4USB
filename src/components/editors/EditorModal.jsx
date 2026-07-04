function SyncStatusBadge({ status, synced, peerCount }) {
  const color =
    status === 'connected'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'connecting'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-slate-400'
        }`}
      />
      {status === 'connected' ? (synced ? '동기화됨' : '동기화 중…') : status}
      {peerCount != null && status === 'connected' && (
        <span className="text-[10px] opacity-80">
          · peers {peerCount}
          {peerCount > 1 ? ` (협업자 ${peerCount - 1})` : ''}
        </span>
      )}
    </span>
  );
}

export default function EditorModal({
  title,
  subtitle,
  status,
  synced,
  peerCount,
  saving,
  onSave,
  onClose,
  children,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-nas-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
            {subtitle && <p className="truncate text-xs text-nas-muted">{subtitle}</p>}
          </div>

          <SyncStatusBadge status={status} synced={synced} peerCount={peerCount} />

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="nas-btn-primary disabled:opacity-50"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? '저장 중…' : 'USB에 저장'}
            </button>
            <button type="button" className="nas-btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
