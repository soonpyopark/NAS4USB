import { useEffect, useState } from 'react';
import { base64ToBytes } from '../lib/bytes.js';
import { unwrapWorkspaceBase64 } from '../lib/filePassword/io.js';
import { isSecFileName } from '../lib/filePassword/secPaths.js';
import { buildMediaStreamUrl } from '../lib/media/streamUrl.js';

/**
 * Stream URL for normal files, decrypted blob URL for `.sec` files.
 *
 * @param {string} relativePath
 * @param {string} [mimeType]
 * @param {number} [revision]
 */
export function usePlaintextObjectUrl(relativePath, mimeType = 'application/octet-stream', revision = 0) {
  const [url, setUrl] = useState(() =>
    isSecFileName(relativePath) ? '' : buildMediaStreamUrl(relativePath),
  );

  useEffect(() => {
    if (!isSecFileName(relativePath)) {
      const base = buildMediaStreamUrl(relativePath);
      setUrl(revision > 0 ? `${base}&v=${revision}` : base);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = '';
    setUrl('');

    void (async () => {
      try {
        const raw = await window.nas4usb.fs.readFile(relativePath);
        const plain = await unwrapWorkspaceBase64(relativePath, raw);
        const bytes = base64ToBytes(plain);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl('');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mimeType, relativePath, revision]);

  return url;
}
