import { useEffect, useMemo, useState } from 'react';
import { getParentPath, sortEntries } from '../lib/fsPaths.js';
import { isImageExtension } from '../lib/media/mediaTypes.js';

/**
 * Sibling files in the same folder (name-sorted), for prev/next navigation.
 *
 * @param {string} relativePath
 * @param {'image'} [kind='image']
 * @param {boolean} [enabled=true]
 */
export function useSiblingFileNav(relativePath, kind = 'image', enabled = true) {
  const [siblings, setSiblings] = useState(/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ ([]));

  useEffect(() => {
    if (!enabled || !relativePath) {
      setSiblings([]);
      return undefined;
    }

    let cancelled = false;
    const parent = getParentPath(relativePath);

    async function load() {
      try {
        const entries = await window.nas4usb.fs.readDir(parent);
        if (cancelled) return;
        const filtered = sortEntries(
          (Array.isArray(entries) ? entries : []).filter((entry) => {
            if (entry.isDirectory) return false;
            if (kind === 'image') return isImageExtension(entry.extension);
            return false;
          }),
          'name',
          'asc',
        );
        setSiblings(filtered);
      } catch {
        if (!cancelled) setSiblings([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [relativePath, kind, enabled]);

  return useMemo(() => {
    if (!enabled) {
      return { prev: null, next: null, index: -1, total: 0 };
    }
    const index = siblings.findIndex((entry) => entry.relativePath === relativePath);
    if (index < 0) {
      return { prev: null, next: null, index: -1, total: siblings.length };
    }
    return {
      prev: index > 0 ? siblings[index - 1] : null,
      next: index < siblings.length - 1 ? siblings[index + 1] : null,
      index,
      total: siblings.length,
    };
  }, [enabled, relativePath, siblings]);
}
