import { useEffect, useState } from 'react';
import {
  indexScopesForSearchScope,
  normalizeDocSearchScope,
} from '../../shared/docSearchScope.js';

const EMPTY_RESULTS = [];

/**
 * @param {unknown} status
 * @param {Set<'share' | 'personal'>} indexScopes
 */
function scopesReady(status, indexScopes) {
  if (!status) return false;
  if (indexScopes.has('personal') && !status?.scopes?.personal?.ready) return false;
  if (indexScopes.has('share') && !status?.scopes?.share?.ready) return false;
  return true;
}

/**
 * @param {unknown} status
 * @param {Set<'share' | 'personal'>} indexScopes
 */
function scopesRunning(status, indexScopes) {
  if (!status) return false;
  if (indexScopes.has('personal') && status?.scopes?.personal?.running) return true;
  if (indexScopes.has('share') && status?.scopes?.share?.running) return true;
  return status?.status === 'running';
}

/**
 * @param {string} query
 * @param {boolean} enabled
 * @param {string} [scope]
 */
export function usePersonalDocSearch(query, enabled, scope = 'all') {
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const searchScope = normalizeDocSearchScope(scope);
  const isActive = Boolean(enabled && query.trim());
  const hasQuery = Boolean(query.trim());

  useEffect(() => {
    if (!enabled) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      setTruncated(false);
      setError('');
      return undefined;
    }

    const indexScopes = indexScopesForSearchScope(searchScope);
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await window.nas4usb.docIndex.status();
        if (!cancelled) setStatus(next);
        // 탐색기만 열었을 때 전체 색인을 돌리면 LAN 목록이 멈춘다.
        // 검색어가 있을 때만 부족한 색인을 시작한다.
        if (
          hasQuery &&
          !scopesRunning(next, indexScopes) &&
          !scopesReady(next, indexScopes)
        ) {
          await window.nas4usb.docIndex.start({
            reset: false,
            scopes: [...indexScopes],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '인덱스를 확인하지 못했습니다.');
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, hasQuery ? 1500 : 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, hasQuery, searchScope]);

  useEffect(() => {
    const normalized = query.trim();
    if (!enabled || !normalized) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      setTruncated(false);
      return undefined;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const payload = await window.nas4usb.docIndex.search(normalized, {
          scope: searchScope,
        });
        if (controller.signal.aborted) return;
        setResults(Array.isArray(payload?.results) ? payload.results : EMPTY_RESULTS);
        setTruncated(Boolean(payload?.truncated));
        setError('');
      } catch (err) {
        if (controller.signal.aborted) return;
        setResults(EMPTY_RESULTS);
        setTruncated(false);
        setError(err instanceof Error ? err.message : '본문 검색에 실패했습니다.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, searchScope]);

  const reindex = async ({ reset = false, scopes } = {}) => {
    setError('');
    try {
      const next = await window.nas4usb.docIndex.start({
        reset,
        scopes: Array.isArray(scopes)
          ? scopes
          : [...indexScopesForSearchScope(searchScope)],
      });
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '인덱싱을 시작하지 못했습니다.');
    }
  };

  const stop = async () => {
    try {
      const next = await window.nas4usb.docIndex.stop();
      setStatus(next);
    } catch {
      // ignore
    }
  };

  return {
    results,
    searching,
    truncated,
    isActive,
    status,
    error,
    scope: searchScope,
    reindex,
    stop,
  };
}
