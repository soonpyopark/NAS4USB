import { useEffect } from 'react';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { registerAppAlertHandler, registerAppChoiceHandler } from '../../lib/nativeDialog.js';

/** Mount once near the app root so `showAppAlert` / `nativeAlert` use in-app dialogs. */
export default function AppDialogHost() {
  const { alert, choose, dialog } = useAppConfirm();

  useEffect(() => {
    return registerAppAlertHandler((options) =>
      alert({
        title: options.title,
        body: options.body,
      }),
    );
  }, [alert]);

  useEffect(() => {
    return registerAppChoiceHandler((options) =>
      choose({
        title: options.title,
        body: options.body,
        primaryLabel: options.primaryLabel,
        extraLabel: options.extraLabel,
        secondaryLabel: options.secondaryLabel,
        cancelLabel: options.cancelLabel,
      }),
    );
  }, [choose]);

  return dialog;
}
