import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';

function SyncStatusBadge({ status, synced, peerCount, className = '' }) {
  const color =
    status === 'connected'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'connecting'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color} ${className}`}
    >
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
  saveDisabled = false,
  hideSave = false,
  onSave,
  onClose,
  allowClose = true,
  fullscreen = false,
  hideHistory = false,
  onShowHistory,
  children,
}) {
  return (
    <AppModal open editor embedded={fullscreen} onClose={allowClose ? onClose : undefined}>
      <header className="modal-editor-header">
        <div className="modal-editor-header__primary min-w-0">
          <p className="truncate text-sm font-semibold text-[#323130]">{title}</p>
          {subtitle && <p className="truncate text-xs text-[#605e5c]">{subtitle}</p>}
        </div>

        <SyncStatusBadge
          className="modal-editor-header__sync"
          status={status}
          synced={synced}
          peerCount={peerCount}
        />

        <AppModalActions className="modal-editor-header__actions !mb-0 shrink-0">
          {!hideHistory && (
            <AppModalButton onClick={onShowHistory}>이력보기</AppModalButton>
          )}
          {!hideSave && (
            <AppModalButton variant="primary" onClick={onSave} disabled={saving || saveDisabled}>
              {saving ? '저장 중…' : '이력저장'}
            </AppModalButton>
          )}
          {allowClose && <AppModalButton onClick={onClose}>닫기</AppModalButton>}
        </AppModalActions>
      </header>

      <div className="modal-editor-body">{children}</div>
    </AppModal>
  );
}
