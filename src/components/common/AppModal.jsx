/**
 * WhiteBoard4Share DeleteConfirmDialog 과 동일한 모달 스타일.
 * @see vendor/whiteboard4share/src/index.css
 */

/**
 * @param {{
 *   open: boolean,
 *   onClose?: () => void,
 *   title?: string,
 *   titleId?: string,
 *   wide?: boolean,
 *   editor?: boolean,
 *   embedded?: boolean,
 *   raised?: boolean,
 *   showCloseButton?: boolean,
 *   className?: string,
 *   children: import('react').ReactNode,
 * }} props
 */
export function AppModal({
  open,
  onClose,
  title,
  titleId = 'app-modal-title',
  wide = false,
  editor = false,
  embedded = false,
  raised = false,
  showCloseButton = false,
  className = '',
  children,
}) {
  if (!open) return null;

  const overlayClass = [
    'modal-overlay',
    embedded ? 'modal-overlay--embedded' : '',
    raised ? 'modal-overlay--raised' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const dialogClass = [
    'modal-dialog',
    wide ? 'modal-dialog--wide' : '',
    editor ? 'modal-dialog--editor' : '',
    embedded ? 'modal-dialog--embedded' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Editor/viewer windows should only close via their explicit [닫기] button,
  // not by clicking the backdrop (avoids accidental data loss while editing).
  const handleOverlayClick = embedded || editor ? undefined : onClose;

  return (
    <div className={overlayClass} onClick={handleOverlayClick}>
      <div
        className={dialogClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {showCloseButton && onClose && (
          <button type="button" onClick={onClose} aria-label="닫기" className="modal-close-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z"
              />
            </svg>
          </button>
        )}
        {title && (
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

/** @param {{ children: import('react').ReactNode, className?: string }} props */
export function AppModalBody({ children, className = '' }) {
  return <div className={`modal-body ${className}`.trim()}>{children}</div>;
}

/** @param {{ children: import('react').ReactNode, className?: string }} props */
export function AppModalActions({ children, className = '' }) {
  return <div className={`modal-actions ${className}`.trim()}>{children}</div>;
}

/**
 * @param {{
 *   variant?: 'primary' | 'secondary' | 'danger',
 *   className?: string,
 *   children: import('react').ReactNode,
 * } & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function AppModalButton({
  variant = 'secondary',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  const variantClass =
    variant === 'primary'
      ? 'modal-btn--primary'
      : variant === 'danger'
        ? 'modal-btn--danger'
        : 'modal-btn--secondary';

  return (
    <button type={type} className={`modal-btn ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   title?: string,
 *   body?: string | import('react').ReactNode,
 *   confirmLabel?: string,
 *   onClose: () => void,
 * }} props
 */
export function AppAlertDialog({
  open,
  title = '알림',
  body = '',
  confirmLabel = '확인',
  onClose,
}) {
  return (
    <AppModal open={open} onClose={onClose} title={title} raised>
      {body &&
        (typeof body === 'string' ? (
          <p className="modal-body whitespace-pre-line">{body}</p>
        ) : (
          body
        ))}
      <AppModalActions>
        <AppModalButton variant="primary" onClick={onClose}>
          {confirmLabel}
        </AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   title?: string,
 *   body?: string | import('react').ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   confirmVariant?: 'primary' | 'danger',
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function AppConfirmDialog({
  open,
  title = '확인',
  body = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}) {
  return (
    <AppModal open={open} onClose={onCancel} title={title} raised>
      {body &&
        (typeof body === 'string' ? (
          <p className="modal-body whitespace-pre-line">{body}</p>
        ) : (
          body
        ))}
      <AppModalActions>
        <AppModalButton variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </AppModalButton>
        <AppModalButton onClick={onCancel}>{cancelLabel}</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}

/**
 * @param {{
 *   open: boolean,
 *   title?: string,
 *   body?: string | import('react').ReactNode,
 *   primaryLabel?: string,
 *   secondaryLabel?: string,
 *   cancelLabel?: string,
 *   onPrimary: () => void,
 *   onSecondary: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function AppChoiceDialog({
  open,
  title = '선택',
  body = '',
  primaryLabel = '확인',
  secondaryLabel = '다른 방법',
  cancelLabel = '취소',
  onPrimary,
  onSecondary,
  onCancel,
}) {
  return (
    <AppModal open={open} onClose={onCancel} title={title} raised>
      {body &&
        (typeof body === 'string' ? (
          <p className="modal-body whitespace-pre-line">{body}</p>
        ) : (
          body
        ))}
      <AppModalActions className="flex-wrap">
        <AppModalButton variant="primary" onClick={onPrimary}>
          {primaryLabel}
        </AppModalButton>
        <AppModalButton onClick={onSecondary}>{secondaryLabel}</AppModalButton>
        <AppModalButton onClick={onCancel}>{cancelLabel}</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
