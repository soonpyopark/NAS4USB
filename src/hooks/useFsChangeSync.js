import { useEffect, useRef } from 'react';
import { createFsChangeSubscription } from '../lib/fsChangeSubscription.js';

/**
 * Subscribe to remote filesystem changes (other users / tabs) and refresh UI.
 *
 * @param {() => void} onRemoteChange
 */
export function useFsChangeSync(onRemoteChange) {
  const onRemoteChangeRef = useRef(onRemoteChange);
  onRemoteChangeRef.current = onRemoteChange;

  useEffect(() => {
    const notify = () => {
      onRemoteChangeRef.current?.();
    };

    if (typeof window.educowork?.subscribeFsChanged === 'function') {
      return window.educowork.subscribeFsChanged(notify);
    }

    return createFsChangeSubscription(notify);
  }, []);
}
