import { useEffect, useState } from 'react';
import { base64ToObjectUrl } from '../lib/media/objectUrl.js';
import { useWorkspaceSession } from './useWorkspaceSession.js';

/**
 * @param {string} relativePath
 * @param {string} mimeType
 */
export function useMediaObjectUrl(relativePath, mimeType) {
  const workspace = useWorkspaceSession(relativePath);
  const [objectUrl, setObjectUrl] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!workspace.ready) return undefined;

    let cancelled = false;
    let blobUrl = null;

    async function loadMedia() {
      setLoadError(null);
      setObjectUrl(null);

      try {
        const base64 = await workspace.readBinary();
        if (cancelled) return;
        blobUrl = base64ToObjectUrl(base64, mimeType);
        setObjectUrl(blobUrl);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '미디어 파일을 불러오지 못했습니다.');
        }
      }
    }

    loadMedia();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [workspace.ready, workspace.sessionId, workspace.readBinary, mimeType]);

  return {
    workspace,
    objectUrl,
    loadError: loadError || workspace.error,
    loading: workspace.loading || (workspace.ready && !objectUrl && !loadError && !workspace.error),
  };
}
