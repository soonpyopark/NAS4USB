import { useMemo, useState } from 'react';
import { buildMediaStreamUrl, getMediaBufferedPercent } from '../lib/media/streamUrl.js';

/**
 * @param {string} relativePath
 */
export function useMediaStream(relativePath) {
  const streamUrl = useMemo(() => buildMediaStreamUrl(relativePath), [relativePath]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);

  const mediaHandlers = {
    onLoadedMetadata: () => {
      setLoading(false);
    },
    onCanPlay: () => {
      setLoading(false);
    },
    onProgress: (event) => {
      const media = event.currentTarget;
      if (media instanceof HTMLMediaElement) {
        setBufferedPercent(getMediaBufferedPercent(media));
      }
    },
    onError: () => {
      setLoadError('미디어 파일을 재생할 수 없습니다.');
      setLoading(false);
    },
  };

  return {
    streamUrl,
    loading,
    loadError,
    bufferedPercent,
    mediaHandlers,
  };
}
