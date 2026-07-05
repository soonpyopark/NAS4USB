const API_PREFIX = '/api';
const POLL_INTERVAL_MS = 4000;
const SSE_RETRY_MS = 3000;

/**
 * @param {(revision?: number) => void} callback
 * @returns {() => void}
 */
export function createFsChangeSubscription(callback) {
  let stopped = false;
  let lastRevision = null;
  /** @type {EventSource | null} */
  let eventSource = null;
  /** @type {number | null} */
  let pollTimer = null;
  /** @type {number | null} */
  let sseRetryTimer = null;

  const emitIfNew = (revision) => {
    if (typeof revision !== 'number') {
      callback(revision);
      return;
    }
    if (lastRevision === null) {
      lastRevision = revision;
      return;
    }
    if (revision !== lastRevision) {
      lastRevision = revision;
      callback(revision);
    }
  };

  const pollRevision = async () => {
    if (stopped) return;
    try {
      const response = await fetch(`${API_PREFIX}/fs/revision`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      emitIfNew(payload?.revision);
    } catch {
      // ignore transient network errors
    }
  };

  const connectSse = () => {
    if (stopped || typeof EventSource === 'undefined') return;

    eventSource?.close();
    eventSource = null;

    try {
      eventSource = new EventSource(`${API_PREFIX}/fs/events`);
    } catch {
      scheduleSseRetry();
      return;
    }

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        emitIfNew(payload?.revision);
      } catch {
        callback();
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
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
    void pollRevision();
    connectSse();
  };

  connectSse();
  void pollRevision();
  pollTimer = window.setInterval(() => {
    void pollRevision();
  }, POLL_INTERVAL_MS);

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    stopped = true;
    eventSource?.close();
    eventSource = null;
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (sseRetryTimer !== null) {
      window.clearTimeout(sseRetryTimer);
      sseRetryTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
