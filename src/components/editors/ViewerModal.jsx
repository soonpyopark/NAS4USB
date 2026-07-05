import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';

export default function ViewerModal({ title, subtitle, onClose, allowClose = true, fullscreen = false, children }) {
  return (
    <AppModal open editor embedded={fullscreen} onClose={allowClose ? onClose : undefined}>
      <header className="modal-editor-header">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#323130]">{title}</p>
          {subtitle && <p className="truncate text-xs text-[#605e5c]">{subtitle}</p>}
        </div>

        <AppModalActions className="!mb-0 shrink-0">
          {allowClose && <AppModalButton onClick={onClose}>닫기</AppModalButton>}
        </AppModalActions>
      </header>

      <div className="modal-editor-body">{children}</div>
    </AppModal>
  );
}
