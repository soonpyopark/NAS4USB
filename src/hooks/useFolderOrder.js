import { useCallback, useEffect, useState } from 'react';
import { useFsSync } from '../context/FsSyncContext.jsx';

export function useFolderOrder() {
  const [folderOrderMap, setFolderOrderMap] = useState(
    /** @type {Record<string, string[]>} */ ({}),
  );
  const { generation } = useFsSync();

  const refreshFolderOrderMap = useCallback(async () => {
    if (!window.nas4usb?.folderOrder?.getMap) {
      setFolderOrderMap({});
      return;
    }

    try {
      const map = await window.nas4usb.folderOrder.getMap();
      setFolderOrderMap(map ?? {});
    } catch {
      setFolderOrderMap({});
    }
  }, []);

  useEffect(() => {
    void refreshFolderOrderMap();
  }, [generation, refreshFolderOrderMap]);

  const setFolderOrder = useCallback(
    async (parentPath, names) => {
      if (!window.nas4usb?.folderOrder?.set) {
        throw new Error('폴더 순서 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderOrder.set({ path: parentPath, names });
      await refreshFolderOrderMap();
    },
    [refreshFolderOrderMap],
  );

  return {
    folderOrderMap,
    refreshFolderOrderMap,
    setFolderOrder,
  };
}
