import { useEffect, useMemo, useState } from 'react';
import { getParentPath } from '../lib/fsPaths.js';
import { isVideoExtension } from '../lib/media/mediaTypes.js';
import { selectVideoSeries } from '../lib/media/videoSeries.js';

/**
 * Same-folder videos whose names match except for the number that changes
 * (`귀멸의 칼날 1기 1화.ts` → `2화`, `파이터 01.mp4` → `02`, `1.mp4` → `2.mp4`).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {string | null | undefined} extension
 * @param {boolean} [enabled=true]
 */
export function useVideoSeriesQueue(relativePath, fileName, extension, enabled = true) {
  const [siblings, setSiblings] = useState(/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ ([]));
  const ext = String(extension || '').toLowerCase();

  useEffect(() => {
    if (!enabled || !relativePath || !fileName) {
      setSiblings([]);
      return undefined;
    }

    let cancelled = false;
    const parent = getParentPath(relativePath);

    async function load() {
      try {
        const entries = await window.nas4usb.fs.readDir(parent);
        if (cancelled) return;
        const videos = (Array.isArray(entries) ? entries : []).filter((entry) => {
          if (entry.isDirectory) return false;
          if (!isVideoExtension(entry.extension)) return false;
          if (ext && String(entry.extension || '').toLowerCase() !== ext) return false;
          return true;
        });
        setSiblings(selectVideoSeries(videos, fileName));
      } catch {
        if (!cancelled) setSiblings([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [relativePath, fileName, ext, enabled]);

  return useMemo(() => {
    if (!enabled) {
      return { prefix: null, prev: null, next: null, index: -1, total: 0 };
    }
    const index = siblings.findIndex((entry) => entry.relativePath === relativePath);
    if (index < 0) {
      return { prefix: fileName, prev: null, next: null, index: -1, total: siblings.length };
    }
    return {
      prefix: fileName,
      prev: index > 0 ? siblings[index - 1] : null,
      next: index < siblings.length - 1 ? siblings[index + 1] : null,
      index,
      total: siblings.length,
    };
  }, [enabled, fileName, relativePath, siblings]);
}
