import { useCallback, useEffect, useState } from 'react';

export function useShareLinks() {
  const [shareMap, setShareMap] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshShareMap = useCallback(async () => {
    if (!window.nas4usb?.share?.getMap) {
      setShareMap({});
      setLoading(false);
      return;
    }

    try {
      const map = await window.nas4usb.share.getMap();
      setShareMap(map ?? {});
    } catch {
      setShareMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshShareMap();
  }, [refreshShareMap]);

  const hasShareLink = useCallback(
    (relativePath) => Boolean(shareMap[relativePath]?.token),
    [shareMap],
  );

  return {
    shareMap,
    loading,
    refreshShareMap,
    hasShareLink,
  };
}
