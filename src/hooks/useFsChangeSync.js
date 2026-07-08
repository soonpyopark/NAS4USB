import { useEffect } from 'react';
import { createFsChangeSubscription } from '../lib/fsChangeSubscription.js';

/**
 * @param {(event: import('../context/FsSyncContext.jsx').FsChangeEvent) => void} onRemoteChange
 * @param {{ debounceMs?: number, isEditorOpen?: boolean }} [options]
 */
export function useFsChangeSync(onRemoteChange, { debounceMs = 800, isEditorOpen = false } = {}) {
  useEffect(() => {
    /** @type {number | null} */
    let debounceTimer = null;

    /** @param {unknown} payload */
    const notify = (payload) => {
      /** @type {import('../context/FsSyncContext.jsx').FsChangeEvent} */
      const event =
        typeof payload === 'number'
          ? { revision: payload }
          : payload && typeof payload === 'object'
            ? /** @type {import('../context/FsSyncContext.jsx').FsChangeEvent} */ (payload)
            : {};

      if (isEditorOpen) {
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
        }
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          onRemoteChange(event);
        }, debounceMs);
        return;
      }

      onRemoteChange(event);
    };

    const unsubscribe =
      typeof window.nas4usb?.subscribeFsChanged === 'function'
        ? window.nas4usb.subscribeFsChanged(notify)
        : createFsChangeSubscription(notify);

    return () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      unsubscribe?.();
    };
  }, [onRemoteChange, debounceMs, isEditorOpen]);
}
