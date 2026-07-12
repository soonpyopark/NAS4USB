import { useEffect } from 'react';
import { useAppConfirm } from '../../hooks/useAppConfirm.jsx';
import { registerAppAlertHandler } from '../../lib/nativeDialog.js';

/** Mount once near the app root so `showAppAlert` / `nativeAlert` use in-app dialogs. */
export default function AppDialogHost() {
  const { alert, dialog } = useAppConfirm();

  useEffect(() => {
    return registerAppAlertHandler((options) =>
      alert({
        title: options.title,
        body: options.body,
      }),
    );
  }, [alert]);

  return dialog;
}
