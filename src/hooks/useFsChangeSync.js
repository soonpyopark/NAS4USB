import { useEffect, useRef } from 'react';
import { createFsChangeSubscription } from '../lib/fsChangeSubscription.js';

/**
 * Coalesce filesystem notifications so a save (document + sidecars) does not
 * rebuild the explorer on every write.
 *
 * @param {(event: import('../context/FsSyncContext.jsx').FsChangeEvent) => void} onRemoteChange
 * @param {{ debounceMs?: number, isEditorOpen?: boolean }} [options]
 */
export function useFsChangeSync(onRemoteChange, { debounceMs = 800, isEditorOpen = false } = {}) {
  const delayRef = useRef(debounceMs);
  delayRef.current = isEditorOpen ? Math.max(debounceMs, 800) : Math.min(debounceMs, 400);

  useEffect(() => {
    /** @type {number | null} */
    let debounceTimer = null;
    /** @type {import('../context/FsSyncContext.jsx').FsChangeEvent | null} */
    let pendingEvent = null;

    /** @param {unknown} payload */
    const notify = (payload) => {
      /** @type {import('../context/FsSyncContext.jsx').FsChangeEvent} */
      const event =
        typeof payload === 'number'
          ? { revision: payload }
          : payload && typeof payload === 'object'
            ? /** @type {import('../context/FsSyncContext.jsx').FsChangeEvent} */ (payload)
            : {};

      pendingEvent = event;
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        const next = pendingEvent;
        pendingEvent = null;
        if (next) onRemoteChange(next);
      }, delayRef.current);
    };

    const unsubscribe =
      typeof window.nas4usb?.subscribeFsChanged === 'function'
        ? window.nas4usb.subscribeFsChanged(notify)
        : createFsChangeSubscription(notify);

    return () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        const next = pendingEvent;
        pendingEvent = null;
        if (next) onRemoteChange(next);
      }
      unsubscribe?.();
    };
  }, [onRemoteChange]);
}
