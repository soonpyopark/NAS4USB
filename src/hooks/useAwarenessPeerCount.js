import { useEffect, useState } from 'react';

/**
 * Y.js awareness 연결 수(본인 포함)를 실시간으로 반환합니다.
 * @param {import('y-websocket').WebsocketProvider | null | undefined} provider
 */
export function useAwarenessPeerCount(provider) {
  const [peerCount, setPeerCount] = useState(null);

  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) {
      setPeerCount(null);
      return undefined;
    }

    const update = () => {
      setPeerCount(awareness.getStates().size);
    };

    update();
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
    };
  }, [provider]);

  return peerCount;
}
