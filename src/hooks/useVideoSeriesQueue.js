import { useEffect, useMemo, useState } from 'react';
import { getParentPath } from '../lib/fsPaths.js';
import { isVideoExtension } from '../lib/media/mediaTypes.js';
import {
  compareVideoSeriesEntries,
  isVideoInSeries,
  videoSeriesPrefix,
} from '../lib/media/videoSeries.js';

/**
 * Numbered same-prefix videos in the current folder (`파이터 01.mp4`, `파이터 02.mp4`, …).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {string | null | undefined} extension
 * @param {boolean} [enabled=true]
 */
export function useVideoSeriesQueue(relativePath, fileName, extension, enabled = true) {
  const [siblings, setSiblings] = useState(/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ ([]));
  const prefix = videoSeriesPrefix(fileName);
  const ext = String(extension || '').toLowerCase();

  useEffect(() => {
    if (!enabled || !relativePath || !prefix) {
      setSiblings([]);
      return undefined;
    }

    let cancelled = false;
    const parent = getParentPath(relativePath);

    async function load() {
      try {
        const entries = await window.nas4usb.fs.readDir(parent);
        if (cancelled) return;
        const series = (Array.isArray(entries) ? entries : [])
          .filter((entry) => {
            if (entry.isDirectory) return false;
            if (!isVideoExtension(entry.extension)) return false;
            if (ext && String(entry.extension || '').toLowerCase() !== ext) return false;
            return isVideoInSeries(entry.name, prefix);
          })
          .sort(compareVideoSeriesEntries);
        setSiblings(series);
      } catch {
        if (!cancelled) setSiblings([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [relativePath, prefix, ext, enabled]);

  return useMemo(() => {
    if (!enabled || !prefix) {
      return { prefix: null, prev: null, next: null, index: -1, total: 0 };
    }
    const index = siblings.findIndex((entry) => entry.relativePath === relativePath);
    if (index < 0) {
      return { prefix, prev: null, next: null, index: -1, total: siblings.length };
    }
    return {
      prefix,
      prev: index > 0 ? siblings[index - 1] : null,
      next: index < siblings.length - 1 ? siblings[index + 1] : null,
      index,
      total: siblings.length,
    };
  }, [enabled, prefix, relativePath, siblings]);
}
