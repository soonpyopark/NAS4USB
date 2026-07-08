import { useCallback, useEffect, useMemo, useState } from 'react';

export function useFavorites() {
  const [favoritesMap, setFavoritesMap] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshFavoritesMap = useCallback(async () => {
    if (!window.nas4usb?.favorites?.getMap) {
      setFavoritesMap({});
      setLoading(false);
      return;
    }

    try {
      const map = await window.nas4usb.favorites.getMap();
      setFavoritesMap(map ?? {});
    } catch {
      setFavoritesMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFavoritesMap();
  }, [refreshFavoritesMap]);

  const setFavorite = useCallback(
    async (relativePath, favorited) => {
      if (!window.nas4usb?.favorites?.set) {
        throw new Error('즐겨찾기 API를 사용할 수 없습니다.');
      }

      await window.nas4usb.favorites.set({ path: relativePath, favorited });
      await refreshFavoritesMap();
    },
    [refreshFavoritesMap],
  );

  const favoritesCount = useMemo(
    () => Object.keys(favoritesMap).filter((path) => favoritesMap[path]).length,
    [favoritesMap],
  );

  const isFavorite = useCallback(
    (relativePath) => Boolean(favoritesMap[relativePath]),
    [favoritesMap],
  );

  return {
    favoritesMap,
    favoritesCount,
    loading,
    refreshFavoritesMap,
    setFavorite,
    isFavorite,
  };
}
