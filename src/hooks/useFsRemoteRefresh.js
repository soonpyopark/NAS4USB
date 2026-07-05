import { useEffect, useRef } from 'react';
import { useFsSync } from '../context/FsSyncContext.jsx';
import { shouldRefreshListForPaths } from '../lib/fsInvalidatePaths.js';

/**
 * @param {'sidebar' | 'explorer'} panelId
 * @param {{
 *   currentPath: string,
 *   getExpandedPaths?: () => Set<string>,
 *   onRefresh: (event: import('../context/FsSyncContext.jsx').FsChangeEvent) => void | Promise<void>,
 *   onRefreshMeta?: () => void | Promise<void>,
 *   enabled?: boolean,
 * }} options
 */
export function useFsRemoteRefresh(
  panelId,
  { currentPath, getExpandedPaths, onRefresh, onRefreshMeta, enabled = true },
) {
  const { generation, lastEvent, consumeSkip } = useFsSync();
  const onRefreshRef = useRef(onRefresh);
  const onRefreshMetaRef = useRef(onRefreshMeta);
  const getExpandedPathsRef = useRef(getExpandedPaths);

  onRefreshRef.current = onRefresh;
  onRefreshMetaRef.current = onRefreshMeta;
  getExpandedPathsRef.current = getExpandedPaths;

  useEffect(() => {
    if (!enabled || generation === 0) return;
    if (consumeSkip(panelId)) return;

    const event = lastEvent ?? {};
    const paths = event.paths ?? [];
    const expandedPaths = getExpandedPathsRef.current?.() ?? new Set(['.']);
    const shouldRefreshList = shouldRefreshListForPaths(paths, currentPath, expandedPaths);

    if (shouldRefreshList) {
      void onRefreshRef.current(event);
      return;
    }

    void onRefreshMetaRef.current?.();
  }, [generation, enabled, panelId, currentPath, consumeSkip, lastEvent]);
}
