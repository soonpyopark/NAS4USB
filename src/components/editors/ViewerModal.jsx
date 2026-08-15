import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';

export default function ViewerModal({
  title,
  titleSuffix,
  subtitle,
  readOnly = false,
  actions,
  onClose,
  allowClose = true,
  fullscreen = false,
  raised = false,
  children,
}) {
  return (
    <AppModal
      open
      editor
      embedded={fullscreen}
      raised={raised}
      onClose={allowClose ? onClose : undefined}
    >
      <header className="modal-editor-header">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline text-sm font-semibold text-[#323130]">
            <span className="truncate">{title}</span>
            {titleSuffix ? (
              <span className="ml-1 shrink-0 font-normal text-[#605e5c]">{titleSuffix}</span>
            ) : null}
          </p>
          {readOnly && <p className="truncate text-xs font-bold text-red-600">읽기전용</p>}
          {subtitle && <p className="truncate text-xs text-[#605e5c]">{subtitle}</p>}
        </div>

        <AppModalActions className="!mb-0 shrink-0">
          {actions}
          {allowClose && <AppModalButton onClick={onClose}>닫기</AppModalButton>}
        </AppModalActions>
      </header>

      <div className="modal-editor-body">{children}</div>
    </AppModal>
  );
}
