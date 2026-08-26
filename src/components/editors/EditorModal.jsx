import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';
import {
  IconBackupCreate,
  IconClose,
  IconExportHtml,
  IconExportHwpx,
  IconExportPdf,
  IconPrint,
  IconHistory,
  IconImportHtml,
  IconImportOnenote,
} from './EditorModalIcons.jsx';

/**
 * Header action rendered icon-only; the label lives in the tooltip.
 *
 * @param {{
 *   label: string,
 *   busyLabel?: string,
 *   busy?: boolean,
 *   variant?: 'primary' | 'secondary' | 'danger',
 *   disabled?: boolean,
 *   onClick?: () => void,
 *   children: import('react').ReactNode,
 * }} props
 */
function HeaderIconButton({ label, busyLabel, busy = false, children, ...props }) {
  const title = busy && busyLabel ? `${label} — ${busyLabel}` : label;
  return (
    <AppModalButton className="modal-btn--icon" title={title} aria-label={title} {...props}>
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </AppModalButton>
  );
}

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
  raised = false,
  hideHistory = false,
  onShowHistory,
  onExportHtml,
  exportingHtml = false,
  onImportHtml,
  importingHtml = false,
  onImportOnenote,
  importingOnenote = false,
  onExportHwpx,
  exportingHwpx = false,
  onExportPdf,
  exportingPdf = false,
  onPrint,
  printing = false,
  children,
}) {
  const transferBusy =
    exportingHtml ||
    exportingHwpx ||
    exportingPdf ||
    printing ||
    importingHtml ||
    importingOnenote;

  return (
    <AppModal open editor embedded={fullscreen} raised={raised} onClose={allowClose ? onClose : undefined}>
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
          {onPrint && (
            <HeaderIconButton
              label="인쇄"
              busyLabel="준비 중…"
              busy={printing}
              onClick={onPrint}
              disabled={transferBusy}
            >
              <IconPrint />
            </HeaderIconButton>
          )}
          {onImportOnenote && (
            <HeaderIconButton
              label="원노트 가져오기"
              busyLabel="가져오는 중…"
              busy={importingOnenote}
              onClick={onImportOnenote}
              disabled={transferBusy}
            >
              <IconImportOnenote />
            </HeaderIconButton>
          )}
          {onImportHtml && (
            <HeaderIconButton
              label="HTML 가져오기"
              busyLabel="가져오는 중…"
              busy={importingHtml}
              onClick={onImportHtml}
              disabled={transferBusy}
            >
              <IconImportHtml />
            </HeaderIconButton>
          )}
          {onExportHtml && (
            <HeaderIconButton
              label="HTML로 내보내기"
              busyLabel="내보내는 중…"
              busy={exportingHtml}
              onClick={onExportHtml}
              disabled={transferBusy}
            >
              <IconExportHtml />
            </HeaderIconButton>
          )}
          {onExportHwpx && (
            <HeaderIconButton
              label="HWPX로 내보내기"
              busyLabel="내보내는 중…"
              busy={exportingHwpx}
              onClick={onExportHwpx}
              disabled={transferBusy}
            >
              <IconExportHwpx />
            </HeaderIconButton>
          )}
          {onExportPdf && (
            <HeaderIconButton
              label="PDF로 내보내기"
              busyLabel="내보내는 중…"
              busy={exportingPdf}
              onClick={onExportPdf}
              disabled={transferBusy}
            >
              <IconExportPdf />
            </HeaderIconButton>
          )}
          {!hideHistory && (
            <HeaderIconButton label="백업보기" onClick={onShowHistory}>
              <IconHistory />
            </HeaderIconButton>
          )}
          {!hideSave && (
            <HeaderIconButton
              label="백업생성"
              busyLabel="저장 중…"
              busy={saving}
              variant="primary"
              onClick={onSave}
              disabled={saving || saveDisabled}
            >
              <IconBackupCreate />
            </HeaderIconButton>
          )}
          {allowClose && (
            <HeaderIconButton label="닫기" onClick={onClose}>
              <IconClose />
            </HeaderIconButton>
          )}
        </AppModalActions>
      </header>

      <div className="modal-editor-body">{children}</div>
    </AppModal>
  );
}
