import { useCallback, useEffect, useRef, useState } from 'react';

import { getShareTokenFromUrl } from '../lib/shareAccess.js';

/**
 * @param {string} relativePath
 */
export function useWorkspaceSession(relativePath) {
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);
  const closingRef = useRef(false);
  const openPathRef = useRef(relativePath);

  openPathRef.current = relativePath;

  useEffect(() => {
    let cancelled = false;

    async function open() {
      setLoading(true);
      setError(null);

      try {
        const shareToken = getShareTokenFromUrl() || undefined;
        const session = await window.nas4usb.workspace.open(openPathRef.current, shareToken);
        if (cancelled) {
          await window.nas4usb.workspace.close(session.sessionId).catch(() => {});
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

    void open();

    return () => {
      cancelled = true;
      if (closingRef.current) return;

      const id = sessionRef.current;
      if (!id) return;

      sessionRef.current = null;
      void window.nas4usb.workspace.close(id).catch(() => {});
    };
  }, []);

  const readBinary = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    const raw = await window.nas4usb.workspace.read(id);
    const { unwrapWorkspaceBase64 } = await import('../lib/filePassword/io.js');
    return unwrapWorkspaceBase64(openPathRef.current, raw);
  }, []);

  const writeBinary = useCallback(async (base64) => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    const { wrapWorkspaceBase64 } = await import('../lib/filePassword/io.js');
    const packed = await wrapWorkspaceBase64(openPathRef.current, base64);
    return window.nas4usb.workspace.write(id, packed);
  }, []);

  const commit = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    return window.nas4usb.workspace.commit(id);
  }, []);

  const saveBinary = useCallback(async (base64) => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    const { wrapWorkspaceBase64 } = await import('../lib/filePassword/io.js');
    const packed = await wrapWorkspaceBase64(openPathRef.current, base64);
    await window.nas4usb.workspace.write(id, packed);
    return window.nas4usb.workspace.commit(id);
  }, []);

  const rename = useCallback(async (newRelativePath) => {
    const id = sessionRef.current;
    if (!id) throw new Error('Workspace session is not ready.');
    const from = openPathRef.current;
    const result = await window.nas4usb.workspace.rename(id, newRelativePath);
    const to = result?.relativePath || newRelativePath;
    const { moveFilePassword } = await import('../lib/filePassword/session.js');
    moveFilePassword(from, to);
    openPathRef.current = to;
    return result;
  }, []);

  const close = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;

    closingRef.current = true;
    sessionRef.current = null;
    setSessionId(null);

    try {
      await window.nas4usb.workspace.close(id);
    } catch (err) {
      sessionRef.current = id;
      setSessionId(id);
      throw err;
    } finally {
      closingRef.current = false;
    }
  }, []);

  return {
    sessionId,
    loading,
    error,
    readBinary,
    writeBinary,
    commit,
    saveBinary,
    rename,
    close,
    ready: Boolean(sessionId) && !loading,
  };
}
