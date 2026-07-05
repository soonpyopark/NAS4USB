import { useCallback, useState } from 'react';
import { AppAlertDialog, AppConfirmDialog } from '../components/common/AppModal.jsx';

/**
 * @param {{
 *   title?: string,
 *   body?: string | import('react').ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   confirmVariant?: 'primary' | 'danger',
 * }} options
 * @returns {Promise<boolean>}
 */
export function useAppConfirm() {
  /** @type {[{ title?: string, body?: string | import('react').ReactNode, confirmLabel?: string, cancelLabel?: string, confirmVariant?: 'primary' | 'danger', resolve: (value: boolean) => void } | null, Function]} */
  const [confirmConfig, setConfirmConfig] = useState(null);
  /** @type {[{ title?: string, body?: string | import('react').ReactNode, confirmLabel?: string, resolve: () => void } | null, Function]} */
  const [alertConfig, setAlertConfig] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmConfig({
        title: options.title ?? '확인',
        body: options.body ?? '',
        confirmLabel: options.confirmLabel ?? '확인',
        cancelLabel: options.cancelLabel ?? '취소',
        confirmVariant: options.confirmVariant ?? 'primary',
        resolve,
      });
    });
  }, []);

  /** @param {{ title?: string, body?: string | import('react').ReactNode, confirmLabel?: string }} options */
  const alert = useCallback((options) => {
    return new Promise((resolve) => {
      setAlertConfig({
        title: options.title ?? '알림',
        body: options.body ?? '',
        confirmLabel: options.confirmLabel ?? '확인',
        resolve,
      });
    });
  }, []);

  const closeConfirm = useCallback((result) => {
    setConfirmConfig((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertConfig((current) => {
      current?.resolve();
      return null;
    });
  }, []);

  const dialog = (
    <>
      <AppConfirmDialog
        open={Boolean(confirmConfig)}
        title={confirmConfig?.title}
        body={confirmConfig?.body}
        confirmLabel={confirmConfig?.confirmLabel}
        cancelLabel={confirmConfig?.cancelLabel}
        confirmVariant={confirmConfig?.confirmVariant}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
      <AppAlertDialog
        open={Boolean(alertConfig)}
        title={alertConfig?.title}
        body={alertConfig?.body}
        confirmLabel={alertConfig?.confirmLabel}
        onClose={closeAlert}
      />
    </>
  );

  return { confirm, alert, dialog };
}
