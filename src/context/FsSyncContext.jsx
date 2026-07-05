import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * @typedef {{ revision?: number, paths?: string[], at?: number, source?: 'local' | 'remote' }} FsChangeEvent
 */

/** @type {import('react').Context<ReturnType<typeof createFsSyncValue> | null>} */
const FsSyncContext = createContext(null);

function createFsSyncValue() {
  return {
    generation: 0,
    lastEvent: /** @type {FsChangeEvent | null} */ (null),
    notifyLocalChange: /** @type {(panelId: string, event?: FsChangeEvent) => void} */ (() => {}),
    notifyRemoteChange: /** @type {(event?: FsChangeEvent) => void} */ (() => {}),
    consumeSkip: /** @type {(panelId: string) => boolean} */ (() => false),
  };
}

export function FsSyncProvider({ children }) {
  const [generation, setGeneration] = useState(0);
  const [lastEvent, setLastEvent] = useState(/** @type {FsChangeEvent | null} */ (null));
  const skipRefreshRef = useRef(/** @type {Set<string>} */ (new Set()));
  const suppressRemoteUntilRef = useRef(0);

  const bump = useCallback((event, skipPanelId) => {
    if (skipPanelId) {
      skipRefreshRef.current.add(skipPanelId);
    }
    setLastEvent(event ?? {});
    setGeneration((value) => value + 1);
  }, []);

  const notifyLocalChange = useCallback(
    (panelId, event = {}) => {
      suppressRemoteUntilRef.current = Date.now() + 600;
      bump({ ...event, source: 'local' }, panelId);
    },
    [bump],
  );

  const notifyRemoteChange = useCallback(
    (event = {}) => {
      if (Date.now() < suppressRemoteUntilRef.current) return;
      bump({ ...event, source: 'remote' });
    },
    [bump],
  );

  const consumeSkip = useCallback((panelId) => {
    if (!skipRefreshRef.current.has(panelId)) return false;
    skipRefreshRef.current.delete(panelId);
    return true;
  }, []);

  const value = useMemo(
    () => ({
      generation,
      lastEvent,
      notifyLocalChange,
      notifyRemoteChange,
      consumeSkip,
    }),
    [generation, lastEvent, notifyLocalChange, notifyRemoteChange, consumeSkip],
  );

  return <FsSyncContext.Provider value={value}>{children}</FsSyncContext.Provider>;
}

export function useFsSync() {
  const context = useContext(FsSyncContext);
  if (!context) {
    throw new Error('useFsSync must be used within FsSyncProvider');
  }
  return context;
}
