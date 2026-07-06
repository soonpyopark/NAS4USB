import { useCallback, useEffect, useState } from 'react';

export function useTrash({ enabled = true } = {}) {
  /** @type {[Record<string, { originalPath: string, deletedAt: string, isDirectory: boolean }>, Function]} */
  const [trashMap, setTrashMap] = useState({});

  const refresh = useCallback(async () => {
    if (!enabled) {
      setTrashMap({});
      return;
    }

    try {
      const map = await window.educowork.trash.getMap();
      setTrashMap(map && typeof map === 'object' ? map : {});
    } catch {
      setTrashMap({});
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    trashMap,
    count: Object.keys(trashMap).length,
    refresh,
  };
}
