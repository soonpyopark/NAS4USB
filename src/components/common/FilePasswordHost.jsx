import { useCallback, useEffect, useState } from 'react';
import { registerFilePasswordPrompt } from '../../lib/filePassword/prompts.js';
import FilePasswordDialog from './FilePasswordDialog.jsx';

export default function FilePasswordHost() {
  const [config, setConfig] = useState(
    /** @type {{ mode: 'unlock' | 'set' | 'remove', fileName?: string, title?: string, body?: string, resolve: (value: string | null) => void } | null} */ (
      null
    ),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return registerFilePasswordPrompt((options) => {
      return new Promise((resolve) => {
        setError('');
        setBusy(false);
        setConfig({
          mode: options.mode,
          fileName: options.fileName,
          title: options.title,
          body: options.body,
          resolve,
        });
      });
    });
  }, []);

  const finish = useCallback((value) => {
    setConfig((current) => {
      current?.resolve(value);
      return null;
    });
    setError('');
    setBusy(false);
  }, []);

  return (
    <FilePasswordDialog
      open={Boolean(config)}
      mode={config?.mode ?? 'unlock'}
      fileName={config?.fileName}
      title={config?.title}
      body={config?.body}
      error={error}
      busy={busy}
      onSubmit={(password) => finish(password)}
      onCancel={() => finish(null)}
    />
  );
}
