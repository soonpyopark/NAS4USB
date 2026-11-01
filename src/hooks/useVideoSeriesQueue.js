import { useEffect, useMemo, useState } from 'react';
import { entryExtensionOf } from '../lib/filePassword/secPaths.js';
import { compareNames, getParentPath } from '../lib/fsPaths.js';
import { isVideoExtension } from '../lib/media/mediaTypes.js';

/**
 * Same-folder videos in name order (`1` < `2` < `10`), for prev/next and
 * play modes (연속 / 랜덤 / 한곡 / 안함). Series-shaped names are not required.
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {string | null | undefined} [_extension]
 * @param {boolean} [enabled=true]
 */
export function useVideoSeriesQueue(relativePath, fileName, _extension, enabled = true) {
  const [siblings, setSiblings] = useState(/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ ([]));

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
        const videos = (Array.isArray(entries) ? entries : [])
          .filter((entry) => !entry.isDirectory && isVideoExtension(entryExtensionOf(entry)))
          .sort((left, right) => compareNames(left.name, right.name));
        setSiblings(videos);
      } catch {
        if (!cancelled) setSiblings([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [relativePath, fileName, enabled]);

  return useMemo(() => {
    if (!enabled) {
      return { prefix: null, prev: null, next: null, siblings: [], index: -1, total: 0 };
    }
    const index = siblings.findIndex((entry) => entry.relativePath === relativePath);
    if (index < 0) {
      return {
        prefix: fileName,
        prev: null,
        next: null,
        siblings,
        index: -1,
        total: siblings.length,
      };
    }
    return {
      prefix: fileName,
      prev: index > 0 ? siblings[index - 1] : null,
      next: index < siblings.length - 1 ? siblings[index + 1] : null,
      siblings,
      index,
      total: siblings.length,
    };
  }, [enabled, fileName, relativePath, siblings]);
}
