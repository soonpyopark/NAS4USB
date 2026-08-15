import { useCallback, useEffect, useState } from 'react';
import { useFsSync } from '../context/FsSyncContext.jsx';

export function useFolderColors() {
  const [folderColorMap, setFolderColorMap] = useState(/** @type {Record<string, string>} */ ({}));
  const { generation } = useFsSync();

  const refreshFolderColorMap = useCallback(async () => {
    if (!window.nas4usb?.folderColors?.getMap) {
      setFolderColorMap({});
      return;
    }

    try {
      const map = await window.nas4usb.folderColors.getMap();
      setFolderColorMap(map ?? {});
    } catch {
      setFolderColorMap({});
    }
  }, []);

  useEffect(() => {
    void refreshFolderColorMap();
  }, [generation, refreshFolderColorMap]);

  const setFolderColor = useCallback(
    async (relativePath, color) => {
      if (!window.nas4usb?.folderColors?.set) {
        throw new Error('폴더 색 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.set({ path: relativePath, color: color || '' });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  return {
    folderColorMap,
    refreshFolderColorMap,
    setFolderColor,
  };
}
