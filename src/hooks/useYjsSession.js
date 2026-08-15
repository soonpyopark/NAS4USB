import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getSyncServerUrl } from '../sync/buildWsUrl.js';
import { toRoomId } from '../sync/roomId.js';
import { loadUserDisplayName } from '../lib/userProfile.js';
import { pickUserColor } from '../lib/userColors.js';

/**
 * @param {string} relativePath
 * @param {{ port: number, addresses: string[] } | null | undefined} syncInfo
 * @param {{ syncReady?: boolean }} [options]
 */
export function useYjsSession(relativePath, syncInfo, { syncReady = true } = {}) {
  const [doc, setDoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [synced, setSynced] = useState(false);
  const roomId = toRoomId(relativePath);

  useEffect(() => {
    if (!syncReady) {
      setDoc(null);
      setProvider(null);
      setStatus('connecting');
      setSynced(false);
      return undefined;
    }

    const ydoc = new Y.Doc();

    if (!syncInfo) {
      setDoc(ydoc);
      setProvider(null);
      setStatus('connected');
      setSynced(true);

      return () => {
        ydoc.destroy();
        setDoc(null);
        setProvider(null);
        setStatus('disconnected');
        setSynced(false);
      };
    }

    const serverUrl = getSyncServerUrl(syncInfo);
    const wsProvider = new WebsocketProvider(serverUrl, roomId, ydoc, {
      connect: true,
      resyncInterval: 5000,
    });

    let active = true;

    const onStatus = ({ status: nextStatus }) => {
      if (active) setStatus(nextStatus);
    };
    const onSync = (isSynced) => {
      if (active) setSynced(isSynced);
    };

    wsProvider.on('status', onStatus);
    wsProvider.on('sync', onSync);

    setDoc(ydoc);
    setProvider(wsProvider);

    loadUserDisplayName().then((name) => {
      if (!active) return;
      const displayName = name || '사용자';
      wsProvider.awareness.setLocalStateField('user', {
        name: displayName,
        color: pickUserColor(displayName),
      });
    });

    return () => {
      active = false;
      wsProvider.off('status', onStatus);
      wsProvider.off('sync', onSync);
      wsProvider.destroy();
      ydoc.destroy();
      setDoc(null);
      setProvider(null);
      setStatus('disconnected');
      setSynced(false);
    };
  }, [relativePath, roomId, syncInfo?.port, syncInfo?.https, syncReady]);

  return { doc, provider, status, synced, roomId };
}
