import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {string} relativePath
 */
export function useWorkspaceSession(relativePath) {
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      setLoading(true);
      setError(null);

      try {
        const session = await window.educowork.workspace.open(relativePath);
        if (cancelled) {
          await window.educowork.workspace.close(session.sessionId);
          return;
        }
        sessionRef.current = session.sessionId;
        setSessionId(session.sessionId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open workspace session');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    open();

    return () => {
      cancelled = true;
      if (sessionRef.current) {
        window.educowork.workspace.close(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, [relativePath]);

  const readBinary = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    return window.educowork.workspace.read(id);
  }, []);

  const writeBinary = useCallback(async (base64) => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    return window.educowork.workspace.write(id, base64);
  }, []);

  const commit = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    return window.educowork.workspace.commit(id);
  }, []);

  const close = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    await window.educowork.workspace.close(id);
    sessionRef.current = null;
    setSessionId(null);
  }, []);

  return {
    sessionId,
    loading,
    error,
    readBinary,
    writeBinary,
    commit,
    close,
    ready: Boolean(sessionId) && !loading,
  };
}
