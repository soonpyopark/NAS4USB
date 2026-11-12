import { useEffect, useMemo, useState } from 'react';
import { entryExtensionOf } from '../lib/filePassword/secPaths.js';
import { compareNames, getParentPath } from '../lib/fsPaths.js';
import { isAudioExtension, isVideoExtension } from '../lib/media/mediaTypes.js';

/**
 * Same-folder media in name order (`1` < `2` < `10`), for prev/next and
 * play modes (연속 / 랜덤 / 한곡 / 안함).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {'video' | 'audio'} kind
 * @param {boolean} [enabled=true]
 */
export function useMediaSeriesQueue(relativePath, fileName, kind, enabled = true) {
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
        const media = (Array.isArray(entries) ? entries : [])
          .filter((entry) => {
            if (entry.isDirectory) return false;
            const ext = entryExtensionOf(entry);
            return kind === 'audio' ? isAudioExtension(ext) : isVideoExtension(ext);
          })
          .sort((left, right) => compareNames(left.name, right.name));
        setSiblings(media);
      } catch {
        if (!cancelled) setSiblings([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [relativePath, fileName, kind, enabled]);

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

/**
 * @deprecated Prefer useMediaSeriesQueue(..., 'video', ...)
 */
export function useVideoSeriesQueue(relativePath, fileName, _extension, enabled = true) {
  return useMediaSeriesQueue(relativePath, fileName, 'video', enabled);
}
