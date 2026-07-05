import { useCallback, useEffect, useState } from 'react';
import { sortEntries } from '../lib/fsPaths.js';
import { filterTrashFromEntries } from '../lib/trashPaths.js';

/**
 * @param {string} currentPath
 */
export function useDirectoryTree(currentPath) {
  const [expandedPaths, setExpandedPaths] = useState(() => new Set(['.']));
  const [childrenMap, setChildrenMap] = useState({});
  const [loadingPaths, setLoadingPaths] = useState(() => new Set());
  const [treeVersion, setTreeVersion] = useState(0);

  const loadChildren = useCallback(async (relativePath) => {
    setLoadingPaths((prev) => new Set(prev).add(relativePath));
    try {
      const entries = await window.educowork.fs.readDir(relativePath);
      const sorted = filterTrashFromEntries(sortEntries(entries, 'name', 'asc'), relativePath);
      setChildrenMap((prev) => ({ ...prev, [relativePath]: sorted }));
      return sorted;
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

  const refreshTree = useCallback(async () => {
    const pathsToReload = ['.', ...Array.from(expandedPaths)];
    const uniquePaths = [...new Set(pathsToReload)];

    const nextEntries = await Promise.all(
      uniquePaths.map(async (path) => {
        const entries = await window.educowork.fs.readDir(path);
        return [path, filterTrashFromEntries(sortEntries(entries, 'name', 'asc'), path)];
      }),
    );

    setChildrenMap((prev) => ({
      ...prev,
      ...Object.fromEntries(nextEntries),
    }));
    setTreeVersion((value) => value + 1);
  }, [expandedPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(['.']));
  }, []);

  const expandAllLoaded = useCallback(async () => {
    const rootEntries = childrenMap['.'] ?? (await loadChildren('.'));
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

  return {
    rootEntries: childrenMap['.'] ?? [],
    childrenMap,
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
