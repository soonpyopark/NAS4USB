import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import { resolveTreeReloadPaths } from '../lib/fsInvalidatePaths.js';
import { sortEntriesByFolderOrder } from '../lib/folderOrder.js';
import { useFolderOrder } from './useFolderOrder.js';
import { readDirWithRetry } from '../lib/readDirWithRetry.js';
import {
  filterTrashFromEntries,
  isFsNotADirectoryError,
  isFsNotFoundError,
} from '../lib/trashPaths.js';
import { isFavoritesPath } from '../lib/favoritesPaths.js';
import { filterTiptapAssetSidecarFromEntries } from '../../shared/tiptapAssetPaths.js';
import { filterFortuneSidecarFromEntries } from '../../shared/fortuneSheetSidecar.js';
import { filterPdfViewerSidecarFromEntries } from '../../shared/pdfViewerSidecar.js';

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 */
function foldersOnly(entries) {
  return entries.filter((entry) => entry.isDirectory);
}

/**
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} relativePath
 */
function filterTreeFolders(entries, relativePath) {
  return foldersOnly(
    filterPdfViewerSidecarFromEntries(
      filterFortuneSidecarFromEntries(
        filterTiptapAssetSidecarFromEntries(filterTrashFromEntries(entries, relativePath)),
      ),
    ),
  );
}

/**
 * @param {string} currentPath
 */
export function useDirectoryTree(currentPath) {
  const { folderOrderMap } = useFolderOrder();
  const { adminId } = useAdminAuthContext();
  const [expandedPaths, setExpandedPaths] = useState(() => new Set(['.']));
  const [childrenMap, setChildrenMap] = useState({});
  const [loadingPaths, setLoadingPaths] = useState(() => new Set());
  const [treeVersion, setTreeVersion] = useState(0);

  const loadChildren = useCallback(async (relativePath) => {
    // Favorites views are virtual: readDir would only retry into an error.
    if (isFavoritesPath(relativePath)) {
      setChildrenMap((prev) => ({ ...prev, [relativePath]: [] }));
      return [];
    }

    setLoadingPaths((prev) => new Set(prev).add(relativePath));
    try {
      const entries = await readDirWithRetry(relativePath);
      const folders = filterTreeFolders(entries, relativePath);
      setChildrenMap((prev) => ({ ...prev, [relativePath]: folders }));
      return folders;
    } catch (err) {
      if (isFsNotFoundError(err) || isFsNotADirectoryError(err)) {
        setChildrenMap((prev) => {
          const next = { ...prev };
          delete next[relativePath];
          return next;
        });
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        return [];
      }
      // 네트워크 실패 — 기존 트리 노드 유지
      return null;
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(relativePath);
        return next;
      });
    }
  }, []);

  const expandPath = useCallback(
    async (relativePath) => {
      await loadChildren(relativePath);
      setExpandedPaths((prev) => new Set(prev).add(relativePath));
    },
    [loadChildren],
  );

  const collapsePath = useCallback((relativePath) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.delete(relativePath);
      return next;
    });
  }, []);

  const toggleExpand = useCallback(
    async (relativePath) => {
      if (expandedPaths.has(relativePath)) {
        collapsePath(relativePath);
        return;
      }
      await expandPath(relativePath);
    },
    [collapsePath, expandPath, expandedPaths],
  );

  const refreshTree = useCallback(async (options) => {
    const pathsToReload = options?.paths?.length
      ? resolveTreeReloadPaths(options.paths, currentPath, expandedPaths)
      : ['.', currentPath, ...Array.from(expandedPaths)];
    const uniquePaths = [...new Set(pathsToReload.filter(Boolean))].filter(
      (path) => !isFavoritesPath(path),
    );

    const nextEntries = await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const entries = await readDirWithRetry(path);
          return [path, filterTreeFolders(entries, path)];
        } catch (err) {
          if (isFsNotFoundError(err) || isFsNotADirectoryError(err)) return [path, null];
          return [path, undefined];
        }
      }),
    );

    setChildrenMap((prev) => {
      const next = { ...prev };
      for (const [path, entries] of nextEntries) {
        if (entries === null) {
          delete next[path];
        } else if (entries !== undefined) {
          next[path] = entries;
        }
      }
      return next;
    });
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const [path, entries] of nextEntries) {
        if (entries === null) next.delete(path);
      }
      return next;
    });
    setTreeVersion((value) => value + 1);
  }, [currentPath, expandedPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(['.']));
  }, []);

  const expandAllLoaded = useCallback(async () => {
    const loadedRoot = await loadChildren('.');
    const rootEntries = childrenMap['.'] ?? loadedRoot ?? [];
    const folderPaths = rootEntries.filter((entry) => entry.isDirectory).map((entry) => entry.relativePath);

    await Promise.all(folderPaths.map((folderPath) => loadChildren(folderPath)));
    setExpandedPaths(new Set(['.', ...folderPaths]));
  }, [childrenMap, loadChildren]);

  useEffect(() => {
    loadChildren('.');
  }, [loadChildren, treeVersion]);

  useEffect(() => {
    let cancelled = false;

    async function syncExpandedToCurrentPath() {
      if (currentPath === '.') {
        if (!cancelled) {
          await loadChildren('.');
          setExpandedPaths((prev) => new Set(prev).add('.'));
        }
        return;
      }

      const segments = currentPath.split('/');
      let cumulative = '';
      const nextExpanded = new Set(['.']);

      for (const segment of segments) {
        cumulative = cumulative ? `${cumulative}/${segment}` : segment;
        nextExpanded.add(cumulative);
        if (!cancelled) {
          await loadChildren(cumulative);
        }
      }

      if (!cancelled) {
        setExpandedPaths((prev) => new Set([...prev, ...nextExpanded]));
      }
    }

    syncExpandedToCurrentPath();
    return () => {
      cancelled = true;
    };
  }, [currentPath, loadChildren]);

  const sortedChildrenMap = useMemo(() => {
    /** @type {Record<string, import('../types/nas4usb.d.ts').FsEntry[]>} */
    const next = {};
    for (const [path, list] of Object.entries(childrenMap)) {
      next[path] = sortEntriesByFolderOrder(list, path, folderOrderMap, adminId);
    }
    return next;
  }, [adminId, childrenMap, folderOrderMap]);

  return {
    rootEntries: sortedChildrenMap['.'] ?? [],
    childrenMap: sortedChildrenMap,
    expandedPaths,
    loadingPaths,
    toggleExpand,
    expandPath,
    collapsePath,
    refreshTree,
    collapseAll,
    expandAllLoaded,
  };
}
