import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTENT_SEARCH_MAX_BYTES,
  isContentSearchableEntry,
  searchEntriesByContent,
} from '../lib/fsContentSearch.js';
import { isExternalFolderPath } from '../../shared/externalFolders.js';

const EMPTY_MATCHES = new Set();

/**
 * Scans the current folder's files for `query` inside their contents.
 * Only runs while `enabled` is true and a query is present.
 * External-folder paths are never scanned (too slow / unbounded).
 *
 * @param {import('../types/nas4usb.d.ts').FsEntry[]} entries
 * @param {string} query
 * @param {boolean} enabled
 */
export function useFolderContentSearch(entries, query, enabled) {
  const [matchedPaths, setMatchedPaths] = useState(EMPTY_MATCHES);
  const [searching, setSearching] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);

  const candidates = useMemo(
    () =>
      (entries ?? []).filter(
        (entry) =>
          !isExternalFolderPath(entry.relativePath) &&
          isContentSearchableEntry(entry) &&
          (entry.size ?? 0) <= CONTENT_SEARCH_MAX_BYTES,
      ),
    [entries],
  );

  const skipped = useMemo(
    () => (entries ?? []).filter((entry) => !entry.isDirectory).length - candidates.length,
    [entries, candidates],
  );

  // Re-scan only when the candidate set actually changes, not on every entries identity change.
  const signature = useMemo(
    () => candidates.map((entry) => `${entry.relativePath}:${entry.size}:${entry.modifiedAt}`).join('|'),
    [candidates],
  );

  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  useEffect(() => {
    const normalized = query.trim();

    if (!enabled || !normalized) {
      setMatchedPaths(EMPTY_MATCHES);
      setSearching(false);
      setScanned(0);
      setTotal(0);
      return undefined;
    }

    const controller = new AbortController();
    setMatchedPaths(EMPTY_MATCHES);
    setScanned(0);
    setTotal(candidatesRef.current.length);
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        await searchEntriesByContent(candidatesRef.current, normalized, {
          signal: controller.signal,
          onMatch: (relativePath) => {
            if (controller.signal.aborted) return;
            setMatchedPaths((prev) => {
              const next = new Set(prev);
              next.add(relativePath);
              return next;
            });
          },
          onProgress: (done) => {
            if (controller.signal.aborted) return;
            setScanned(done);
          },
        });
      } catch {
        // Scan failures are non-fatal — name matches still show.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, query, signature]);

  return { matchedPaths, searching, scanned, total, skipped };
}
