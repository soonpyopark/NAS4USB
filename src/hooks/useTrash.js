import { useCallback, useEffect, useState } from 'react';

export function useTrash() {
  /** @type {[Record<string, { originalPath: string, deletedAt: string, isDirectory: boolean }>, Function]} */
  const [trashMap, setTrashMap] = useState({});

  const refresh = useCallback(async () => {
    try {
      const map = await window.educowork.trash.getMap();
      setTrashMap(map && typeof map === 'object' ? map : {});
    } catch {
      setTrashMap({});
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    trashMap,
    count: Object.keys(trashMap).length,
    refresh,
  };
}
