import { useCallback, useMemo, useState } from 'react';

/**
 * @param {import('../types/educowork.d.ts').FsEntry[]} entries
 */
export function useFileSelection(entries) {
  const [selectedPaths, setSelectedPaths] = useState([]);

  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedSet.has(entry.relativePath)),
    [entries, selectedSet],
  );

  const clearSelection = useCallback(() => {
    setSelectedPaths([]);
  }, []);

  const selectOnly = useCallback((relativePath) => {
    setSelectedPaths([relativePath]);
  }, []);

  const toggleSelection = useCallback((relativePath) => {
    setSelectedPaths((prev) =>
      prev.includes(relativePath) ? prev.filter((path) => path !== relativePath) : [...prev, relativePath],
    );
  }, []);

  const selectRange = useCallback(
    (anchorPath, targetPath) => {
      const anchorIndex = entries.findIndex((entry) => entry.relativePath === anchorPath);
      const targetIndex = entries.findIndex((entry) => entry.relativePath === targetPath);
      if (anchorIndex < 0 || targetIndex < 0) {
        selectOnly(targetPath);
        return;
      }

      const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      setSelectedPaths(entries.slice(start, end + 1).map((entry) => entry.relativePath));
    },
    [entries, selectOnly],
  );

  const selectAll = useCallback(() => {
    setSelectedPaths(entries.map((entry) => entry.relativePath));
  }, [entries]);

  return {
    selectedPaths,
    selectedSet,
    selectedEntries,
    clearSelection,
    selectOnly,
    toggleSelection,
    selectRange,
    selectAll,
  };
}
