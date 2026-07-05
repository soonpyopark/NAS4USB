import { useEffect, useState } from 'react';
import { searchFileEntries } from '../lib/fsSearch.js';

/**
 * @param {string} query
 * @param {number} [fsRevision]
 */
export function useFileSearch(query, fsRevision = 0) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const isActive = Boolean(query.trim());

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setSearching(false);
      setTruncated(false);
      return undefined;
    }

    setSearching(true);
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const { entries, truncated: hitLimit } = await searchFileEntries(normalized, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResults(entries);
        setTruncated(hitLimit);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setTruncated(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, fsRevision]);

  return { results, searching, truncated, isActive };
}
