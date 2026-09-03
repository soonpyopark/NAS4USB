import { useEffect, useState } from 'react';

const EMPTY_RESULTS = [];

/**
 * @param {string} query
 * @param {boolean} enabled
 */
export function usePersonalDocSearch(query, enabled) {
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

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

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await window.nas4usb.docIndex.status();
        if (!cancelled) setStatus(next);
        // 탐색기만 열었을 때 전체 색인을 돌리면 LAN 목록이 멈춘다.
        // 검색어가 있을 때만 부족한 색인을 시작한다.
        if (hasQuery && next?.status !== 'running' && !next?.ready) {
          await window.nas4usb.docIndex.start({ reset: false });
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
  }, [enabled, hasQuery]);

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
        const payload = await window.nas4usb.docIndex.search(normalized);
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
  }, [query, enabled]);

  const reindex = async ({ reset = false } = {}) => {
    setError('');
    try {
      const next = await window.nas4usb.docIndex.start({ reset });
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
    reindex,
    stop,
  };
}
