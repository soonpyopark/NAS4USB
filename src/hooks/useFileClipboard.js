import { useCallback, useState } from 'react';
import { joinRelativePath, resolveUniqueName } from '../lib/fsPaths.js';
import { isTrashPath } from '../lib/trashPaths.js';

/** @typedef {{ mode: 'copy'|'cut', entries: import('../types/nas4usb.d.ts').FsEntry[] }} FileClipboard */

export function useFileClipboard() {
  const [clipboard, setClipboard] = useState(null);

  const copyEntries = useCallback((/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ entries) => {
    if (!entries.length) return;
    setClipboard({ mode: 'copy', entries });
  }, []);

  const cutEntries = useCallback((/** @type {import('../types/nas4usb.d.ts').FsEntry[]} */ entries) => {
    if (!entries.length) return;
    setClipboard({ mode: 'cut', entries });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
  }, []);

  const pasteEntries = useCallback(
    async (destinationPath, existingNames) => {
      if (!clipboard?.entries.length) return false;

      if (isTrashPath(destinationPath)) {
        throw new Error('휴지통에는 붙여넣기할 수 없습니다. 삭제 메뉴를 사용해 주세요.');
      }

      const names = new Set(existingNames);

      for (const entry of clipboard.entries) {
        const uniqueName = resolveUniqueName(names, entry.name);
        const destination = joinRelativePath(destinationPath, uniqueName);
        names.add(uniqueName);

        if (clipboard.mode === 'copy') {
          await window.nas4usb.fs.copy(entry.relativePath, destination);
        } else {
          await window.nas4usb.fs.move(entry.relativePath, destination);
        }
      }

      if (clipboard.mode === 'cut') {
        setClipboard(null);
      }

      return true;
    },
    [clipboard],
  );

  return {
    clipboard,
    hasClipboard: Boolean(clipboard?.entries.length),
    copyEntries,
    cutEntries,
    clearClipboard,
    pasteEntries,
  };
}
