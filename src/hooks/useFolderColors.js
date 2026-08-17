import { useCallback, useEffect, useState } from 'react';
import { useFsSync } from '../context/FsSyncContext.jsx';

export function useFolderColors() {
  const [folderColorMap, setFolderColorMap] = useState(/** @type {Record<string, string>} */ ({}));
  const [nameBoldMap, setNameBoldMap] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [fileLevelMap, setFileLevelMap] = useState(/** @type {Record<string, number>} */ ({}));
  const [fileCollapsedMap, setFileCollapsedMap] = useState(
    /** @type {Record<string, boolean>} */ ({}),
  );
  const { generation } = useFsSync();

  const refreshFolderColorMap = useCallback(async () => {
    if (!window.nas4usb?.folderColors?.getMap) {
      setFolderColorMap({});
      setNameBoldMap({});
      setFileLevelMap({});
      setFileCollapsedMap({});
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
    } else {
      try {
        const bold = await window.nas4usb.folderColors.getBoldMap();
        setNameBoldMap(bold && typeof bold === 'object' ? bold : {});
      } catch {
        setNameBoldMap({});
      }
    }

    if (typeof window.nas4usb.folderColors.getLevelMap !== 'function') {
      setFileLevelMap({});
    } else {
      try {
        const levels = await window.nas4usb.folderColors.getLevelMap();
        setFileLevelMap(levels && typeof levels === 'object' ? levels : {});
      } catch {
        setFileLevelMap({});
      }
    }

    if (typeof window.nas4usb.folderColors.getCollapsedMap !== 'function') {
      setFileCollapsedMap({});
    } else {
      try {
        const collapsed = await window.nas4usb.folderColors.getCollapsedMap();
        setFileCollapsedMap(collapsed && typeof collapsed === 'object' ? collapsed : {});
      } catch {
        setFileCollapsedMap({});
      }
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
        throw new Error('주요 파일 표시 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.setBold({ path: relativePath, bold: Boolean(bold) });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  const setFileLevel = useCallback(
    async (relativePath, level) => {
      if (!window.nas4usb?.folderColors?.setLevel) {
        throw new Error('파일 단계 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.setLevel({ path: relativePath, level });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  const setFileLevels = useCallback(
    async (entries) => {
      if (!window.nas4usb?.folderColors?.setLevels) {
        throw new Error('파일 단계 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.setLevels({ entries });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  const setFileCollapsed = useCallback(
    async (relativePath, collapsed) => {
      if (!window.nas4usb?.folderColors?.setCollapsed) {
        throw new Error('하위 파일 접기 API를 사용할 수 없습니다.');
      }
      await window.nas4usb.folderColors.setCollapsed({
        path: relativePath,
        collapsed: Boolean(collapsed),
      });
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  const setFileCollapsedMany = useCallback(
    async (entries) => {
      if (typeof window.nas4usb?.folderColors?.setCollapsedMany === 'function') {
        await window.nas4usb.folderColors.setCollapsedMany({ entries });
        await refreshFolderColorMap();
        return;
      }
      if (!window.nas4usb?.folderColors?.setCollapsed) {
        throw new Error('하위 파일 접기 API를 사용할 수 없습니다.');
      }
      for (const item of entries || []) {
        await window.nas4usb.folderColors.setCollapsed({
          path: item.path || item.relativePath,
          collapsed: Boolean(item.collapsed),
        });
      }
      await refreshFolderColorMap();
    },
    [refreshFolderColorMap],
  );

  return {
    folderColorMap,
    nameBoldMap,
    fileLevelMap,
    fileCollapsedMap,
    refreshFolderColorMap,
    setFolderColor,
    setNameBold,
    setFileLevel,
    setFileLevels,
    setFileCollapsed,
    setFileCollapsedMany,
  };
}
