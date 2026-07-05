import { useCallback, useEffect, useState } from 'react';

export function useFileAccess() {
  const [accessMap, setAccessMap] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshAccessMap = useCallback(async () => {
    if (!window.educowork?.fileAccess?.getMap) {
      setAccessMap({});
      setLoading(false);
      return;
    }

    try {
      const map = await window.educowork.fileAccess.getMap();
      setAccessMap(map ?? {});
    } catch {
      setAccessMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAccessMap();
  }, [refreshAccessMap]);

  const setFileAccess = useCallback(
    async (relativePath, patch) => {
      if (!window.educowork?.fileAccess?.set) {
        throw new Error('파일 접근 설정 API를 사용할 수 없습니다.');
      }

      await window.educowork.fileAccess.set({ path: relativePath, ...patch });
      await refreshAccessMap();
    },
    [refreshAccessMap],
  );

  return {
    accessMap,
    loading,
    refreshAccessMap,
    setFileAccess,
  };
}
