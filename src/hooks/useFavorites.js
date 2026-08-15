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

  const setFavoriteOrder = useCallback(async (kind, paths) => {
    if (!window.nas4usb?.favorites?.setOrder) {
      throw new Error('즐겨찾기 순서 API를 사용할 수 없습니다.');
    }
    await window.nas4usb.favorites.setOrder({ kind, paths });
  }, []);

  // Stored values are 'folder' / 'file' ('true' in legacy stores means a file).
  const { favoritesCount, folderFavoritesCount, fileFavoritesCount } = useMemo(() => {
    let folders = 0;
    let files = 0;
    for (const value of Object.values(favoritesMap)) {
      if (!value) continue;
      if (value === 'folder') folders += 1;
      else files += 1;
    }
    return {
      favoritesCount: folders + files,
      folderFavoritesCount: folders,
      fileFavoritesCount: files,
    };
  }, [favoritesMap]);

  const isFavorite = useCallback(
    (relativePath) => Boolean(favoritesMap[relativePath]),
    [favoritesMap],
  );

  return {
    favoritesMap,
    favoritesCount,
    folderFavoritesCount,
    fileFavoritesCount,
    loading,
    refreshFavoritesMap,
    setFavorite,
    setFavoriteOrder,
    isFavorite,
  };
}
