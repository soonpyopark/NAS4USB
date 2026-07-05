import { useCallback, useEffect, useState } from 'react';

/**
 * @param {number} [fsRevision]
 */
export function useTrash(fsRevision = 0) {
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
  }, [refresh, fsRevision]);

  return {
    trashMap,
    count: Object.keys(trashMap).length,
    refresh,
  };
}
