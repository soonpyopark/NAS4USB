import { useCallback, useEffect, useState } from 'react';
import { useFsChangeSync } from './useFsChangeSync.js';

/**
 * Live external-folder mounts (aliases) from the host.
 * @returns {import('../../shared/externalFolders.js').ExternalFolderMount[]}
 */
export function useExternalFolders() {
  const [folders, setFolders] = useState(
    /** @type {import('../../shared/externalFolders.js').ExternalFolderMount[]} */ ([]),
  );

  const refresh = useCallback(async () => {
    try {
      const paths = await window.nas4usb.getPaths();
      setFolders(Array.isArray(paths?.externalFolders) ? paths.externalFolders : []);
    } catch {
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFsChangeSync(() => {
    void refresh();
  }, { debounceMs: 200 });

  return folders;
}
