import { useCallback, useState } from 'react';
import {
  AppAlertDialog,
  AppChoiceDialog,
  AppConfirmDialog,
} from '../components/common/AppModal.jsx';

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
  /** @type {[{ title?: string, body?: string | import('react').ReactNode, primaryLabel?: string, extraLabel?: string, secondaryLabel?: string, cancelLabel?: string, resolve: (value: 'primary' | 'extra' | 'secondary' | null) => void } | null, Function]} */
  const [choiceConfig, setChoiceConfig] = useState(null);

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

  /**
   * @param {{
   *   title?: string,
   *   body?: string | import('react').ReactNode,
   *   primaryLabel?: string,
   *   extraLabel?: string,
   *   secondaryLabel?: string,
   *   cancelLabel?: string,
   * }} options
   * @returns {Promise<'primary' | 'extra' | 'secondary' | null>}
   */
  const choose = useCallback((options) => {
    return new Promise((resolve) => {
      setChoiceConfig({
        title: options.title ?? '선택',
        body: options.body ?? '',
        primaryLabel: options.primaryLabel ?? '확인',
        extraLabel: options.extraLabel ?? '',
        secondaryLabel: options.secondaryLabel ?? '다른 방법',
        cancelLabel: options.cancelLabel ?? '취소',
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

  const closeChoice = useCallback((result) => {
    setChoiceConfig((current) => {
      current?.resolve(result);
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
      <AppChoiceDialog
        open={Boolean(choiceConfig)}
        title={choiceConfig?.title}
        body={choiceConfig?.body}
        primaryLabel={choiceConfig?.primaryLabel}
        extraLabel={choiceConfig?.extraLabel}
        secondaryLabel={choiceConfig?.secondaryLabel}
        cancelLabel={choiceConfig?.cancelLabel}
        onPrimary={() => closeChoice('primary')}
        onExtra={() => closeChoice('extra')}
        onSecondary={() => closeChoice('secondary')}
        onCancel={() => closeChoice(null)}
      />
    </>
  );

  return { confirm, alert, choose, dialog };
}
