import { useCallback, useEffect, useState } from 'react';
import { sortEntries } from '../lib/fsPaths.js';
import { filterTrashFromEntries, isFsNotFoundError } from '../lib/trashPaths.js';

/**
 * @param {string} currentPath
 * @param {number} [fsRevision]
 */
export function useDirectoryTree(currentPath, fsRevision = 0) {
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
    } catch (err) {
      if (isFsNotFoundError(err)) {
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
      throw err;
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
    const pathsToReload = ['.', currentPath, ...Array.from(expandedPaths)];
    const uniquePaths = [...new Set(pathsToReload.filter(Boolean))];

    const nextEntries = await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const entries = await window.educowork.fs.readDir(path);
          return [path, filterTrashFromEntries(sortEntries(entries, 'name', 'asc'), path)];
        } catch (err) {
          if (isFsNotFoundError(err)) return [path, null];
          throw err;
        }
      }),
    );

    setChildrenMap((prev) => {
      const next = { ...prev };
      for (const [path, entries] of nextEntries) {
        if (entries === null) {
          delete next[path];
        } else {
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

  useEffect(() => {
    if (fsRevision === 0) return;
    void refreshTree();
  }, [fsRevision, refreshTree]);

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
