import { useCallback, useEffect, useRef, useState } from 'react';
import { joinRelativePath, resolveUniqueName, validateFolderName } from '../lib/fsPaths.js';
import { readDirWithRetry } from '../lib/readDirWithRetry.js';
import {
  filterTrashFromEntries,
  isFsNotADirectoryError,
  isFsNotFoundError,
  isTrashPath,
} from '../lib/trashPaths.js';
import { favoritesViewKind, isFavoritesPath } from '../lib/favoritesPaths.js';
import { filterTiptapAssetSidecarFromEntries } from '../../shared/tiptapAssetPaths.js';
import { filterFortuneSidecarFromEntries } from '../../shared/fortuneSheetSidecar.js';
import { filterPdfViewerSidecarFromEntries } from '../../shared/pdfViewerSidecar.js';
import { buildNewFileContent, resolveNewFileName } from '../lib/files/newFileFactory.js';
import { uploadFilesAtPath } from '../lib/fsWriteActions.js';

export function useFileSystem(currentPath) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedPathRef = useRef(/** @type {string | null} */ (null));

  const refresh = useCallback(async () => {
    if (loadedPathRef.current !== currentPath) {
      setLoading(true);
    }
    setError(null);

    try {
      if (isFavoritesPath(currentPath)) {
        const result = await window.nas4usb.favorites.listEntries();
        const all = Array.isArray(result) ? result : [];
        const kind = favoritesViewKind(currentPath);
        setEntries(
          kind === 'folders'
            ? all.filter((entry) => entry.isDirectory)
            : kind === 'files'
              ? all.filter((entry) => !entry.isDirectory)
              : all,
        );
      } else {
        const result = await readDirWithRetry(currentPath);
        setEntries(
          filterPdfViewerSidecarFromEntries(
            filterFortuneSidecarFromEntries(
              filterTiptapAssetSidecarFromEntries(filterTrashFromEntries(result, currentPath)),
            ),
          ),
        );
      }
    } catch (err) {
      if (isFsNotFoundError(err) || isFsNotADirectoryError(err)) {
        setEntries([]);
        setError(null);
      } else {
        // 재시도 후에도 실패 — 목록은 유지하고 배너는 띄우지 않음
        setError(null);
      }
    } finally {
      loadedPathRef.current = currentPath;
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mkdir = useCallback(
    async (name) => {
      await window.nas4usb.fs.mkdir(joinRelativePath(currentPath, name));
    },
    [currentPath],
  );

  const createFolder = useCallback(
    async (name) => {
      const validation = validateFolderName(name);
      if (!validation.ok) {
        throw new Error(validation.error);
      }

      const existingNames = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
      const folderName = resolveUniqueName(existingNames, validation.name, true);
      await window.nas4usb.fs.mkdir(joinRelativePath(currentPath, folderName));
      return folderName;
    },
    [currentPath, entries],
  );

  const createFile = useCallback(
    async (name, base64 = '') => {
      await window.nas4usb.fs.writeFile(joinRelativePath(currentPath, name), base64);
    },
    [currentPath],
  );

  const createNewTypedFile = useCallback(
    async (type) => {
      const existingNames = entries.map((entry) => entry.name);
      const fileName = resolveNewFileName(existingNames, type);
      const base64 = await buildNewFileContent(type);
      await createFile(fileName, base64);
      return fileName;
    },
    [createFile, entries],
  );

  const remove = useCallback(async (relativePath) => {
    await window.nas4usb.fs.delete(relativePath);
  }, []);

  const moveToTrash = useCallback(async (relativePath) => {
    await window.nas4usb.trash.move(relativePath);
  }, []);

  const restoreFromTrash = useCallback(async (relativePath) => {
    return window.nas4usb.trash.restore(relativePath);
  }, []);

  const emptyTrash = useCallback(async () => {
    await window.nas4usb.trash.empty();
  }, []);

  const deletePermanent = useCallback(async (relativePath) => {
    await window.nas4usb.trash.deletePermanent(relativePath);
  }, []);

  const rename = useCallback(async (fromRelative, toRelative) => {
    await window.nas4usb.fs.rename(fromRelative, toRelative);
  }, []);

  const copyTo = useCallback(async (fromRelative, toRelative) => {
    await window.nas4usb.fs.copy(fromRelative, toRelative);
  }, []);

  const moveTo = useCallback(async (fromRelative, toRelative) => {
    await window.nas4usb.fs.move(fromRelative, toRelative);
  }, []);

  const uploadFiles = useCallback(
    async (/** @type {File[]} */ files, options = {}) => {
      if (isTrashPath(currentPath) || isFavoritesPath(currentPath)) {
        throw new Error('이 위치에는 파일을 추가할 수 없습니다.');
      }
      return uploadFilesAtPath(currentPath, files, options);
    },
    [currentPath],
  );

  const stat = useCallback(async (relativePath) => window.nas4usb.fs.stat(relativePath), []);

  const openInSystem = useCallback(async (relativePath) => {
    await window.nas4usb.fs.openPath(relativePath);
  }, []);

  return {
    entries,
    loading,
    error,
    refresh,
    mkdir,
    createFolder,
    createFile,
    createNewTypedFile,
    remove,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    deletePermanent,
    rename,
    copyTo,
    moveTo,
    uploadFiles,
    stat,
    openInSystem,
  };
}
