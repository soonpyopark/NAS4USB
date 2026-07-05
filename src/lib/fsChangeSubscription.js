const API_PREFIX = '/api';
/** SSE 끊김 시에만 revision 폴링 (백업) */
const POLL_FALLBACK_MS = 5000;
const SSE_RETRY_MS = 2000;

/**
 * @param {(event: { revision?: number, paths?: string[], at?: number }) => void} callback
 * @returns {() => void}
 */
export function createFsChangeSubscription(callback) {
  let stopped = false;
  let lastRevision = null;
  let sseConnected = false;
  /** @type {EventSource | null} */
  let eventSource = null;
  /** @type {number | null} */
  let pollTimer = null;
  /** @type {number | null} */
  let sseRetryTimer = null;

  /** @param {{ revision?: number, paths?: string[], at?: number } | number | undefined} payload */
  const emitIfNew = (payload) => {
    if (typeof payload === 'number') {
      if (lastRevision === null) {
        lastRevision = payload;
        return;
      }
      if (payload !== lastRevision) {
        lastRevision = payload;
        callback({ revision: payload });
      }
      return;
    }

    if (!payload || typeof payload !== 'object' || typeof payload.revision !== 'number') {
      callback(payload && typeof payload === 'object' ? payload : {});
      return;
    }

    if (lastRevision === null) {
      lastRevision = payload.revision;
      return;
    }

    if (payload.revision !== lastRevision) {
      lastRevision = payload.revision;
      callback(payload);
    }
  };

  const syncRevisionBaseline = async () => {
    if (stopped) return;
    try {
      const response = await fetch(`${API_PREFIX}/fs/revision`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (typeof payload?.revision === 'number') {
        lastRevision = payload.revision;
      }
    } catch {
      // ignore
    }
  };

  const pollRevision = async () => {
    if (stopped || sseConnected) return;
    try {
      const response = await fetch(`${API_PREFIX}/fs/revision`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      emitIfNew(payload);
    } catch {
      // ignore transient network errors — next poll or SSE reconnect
    }
  };

  const startPollFallback = () => {
    if (pollTimer !== null) return;
    void pollRevision();
    pollTimer = window.setInterval(() => {
      void pollRevision();
    }, POLL_FALLBACK_MS);
  };

  const stopPollFallback = () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const connectSse = () => {
    if (stopped || typeof EventSource === 'undefined') {
      startPollFallback();
      return;
    }

    eventSource?.close();
    eventSource = null;
    sseConnected = false;

    try {
      eventSource = new EventSource(`${API_PREFIX}/fs/events`);
    } catch {
      startPollFallback();
      scheduleSseRetry();
      return;
    }

    eventSource.onopen = () => {
      sseConnected = true;
      stopPollFallback();
      void syncRevisionBaseline();
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        emitIfNew(payload);
      } catch {
        callback({});
      }
    };

    eventSource.onerror = () => {
      sseConnected = false;
      eventSource?.close();
      eventSource = null;
      startPollFallback();
      scheduleSseRetry();
    };
  };

  const scheduleSseRetry = () => {
    if (stopped || sseRetryTimer !== null) return;
    sseRetryTimer = window.setTimeout(() => {
      sseRetryTimer = null;
      connectSse();
    }, SSE_RETRY_MS);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    if (sseConnected) {
      void syncRevisionBaseline();
      return;
    }
    void pollRevision();
    connectSse();
  };

  connectSse();

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    stopped = true;
    sseConnected = false;
    eventSource?.close();
    eventSource = null;
    stopPollFallback();
    if (sseRetryTimer !== null) {
      window.clearTimeout(sseRetryTimer);
      sseRetryTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
