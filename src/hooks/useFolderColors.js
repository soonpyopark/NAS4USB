import { useCallback, useEffect, useState } from 'react';
import { useFsSync } from '../context/FsSyncContext.jsx';

export function useFolderColors() {
  const [folderColorMap, setFolderColorMap] = useState(/** @type {Record<string, string>} */ ({}));
  const [nameBoldMap, setNameBoldMap] = useState(/** @type {Record<string, boolean>} */ ({}));
  const { generation } = useFsSync();

  const refreshFolderColorMap = useCallback(async () => {
    if (!window.nas4usb?.folderColors?.getMap) {
      setFolderColorMap({});
      setNameBoldMap({});
      return;
    }

    try {
      const map = await window.nas4usb.folderColors.getMap();
      setFolderColorMap(map && typeof map === 'object' ? map : {});
    } catch {
      setFolderColorMap({});
    }

    if (typeof window.nas4usb.folderColors.getBoldMap !== 'function') {
      setNameBoldMap({});
      return;
    }
    try {
      const bold = await window.nas4usb.folderColors.getBoldMap();
      setNameBoldMap(bold && typeof bold === 'object' ? bold : {});
    } catch {
      setNameBoldMap({});
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

  const setNameBold = useCallback(
    async (relativePath, bold) => {
      if (!window.nas4usb?.folderColors?.setBold) {
        throw new Error('이름 굵기 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.setBold({ path: relativePath, bold: Boolean(bold) });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  return {
    folderColorMap,
    nameBoldMap,
    refreshFolderColorMap,
    setFolderColor,
    setNameBold,
  };
}
