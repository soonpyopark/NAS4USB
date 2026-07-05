import { useCallback, useEffect, useState } from 'react';
import { joinRelativePath, readFileAsBase64, resolveUniqueName, validateFolderName } from '../lib/fsPaths.js';
import { readDirWithRetry } from '../lib/readDirWithRetry.js';
import { filterTrashFromEntries, isFsNotFoundError, isTrashPath } from '../lib/trashPaths.js';
import { buildNewFileContent, resolveNewFileName } from '../lib/files/newFileFactory.js';
import { convertHwpBase64ToHwpx, isHwpFileName, toHwpxFileName } from '@educowork/rhwp/hwpConvert.js';

export function useFileSystem(currentPath) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await readDirWithRetry(currentPath);
      setEntries(filterTrashFromEntries(result, currentPath));
    } catch (err) {
      if (isFsNotFoundError(err)) {
        setEntries([]);
        setError(null);
      } else {
        // 재시도 후에도 실패 — 목록은 유지하고 배너는 띄우지 않음
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mkdir = useCallback(
    async (name) => {
      await window.educowork.fs.mkdir(joinRelativePath(currentPath, name));
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
      const folderName = resolveUniqueName(existingNames, validation.name);
      await window.educowork.fs.mkdir(joinRelativePath(currentPath, folderName));
      return folderName;
    },
    [currentPath, entries],
  );

  const createFile = useCallback(
    async (name, base64 = '') => {
      await window.educowork.fs.writeFile(joinRelativePath(currentPath, name), base64);
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
    await window.educowork.fs.delete(relativePath);
  }, []);

  const moveToTrash = useCallback(async (relativePath) => {
    await window.educowork.trash.move(relativePath);
  }, []);

  const restoreFromTrash = useCallback(async (relativePath) => {
    return window.educowork.trash.restore(relativePath);
  }, []);

  const emptyTrash = useCallback(async () => {
    await window.educowork.trash.empty();
  }, []);

  const deletePermanent = useCallback(async (relativePath) => {
    await window.educowork.trash.deletePermanent(relativePath);
  }, []);

  const rename = useCallback(async (fromRelative, toRelative) => {
    await window.educowork.fs.rename(fromRelative, toRelative);
  }, []);

  const copyTo = useCallback(async (fromRelative, toRelative) => {
    await window.educowork.fs.copy(fromRelative, toRelative);
  }, []);

  const moveTo = useCallback(async (fromRelative, toRelative) => {
    await window.educowork.fs.move(fromRelative, toRelative);
  }, []);

  const uploadFiles = useCallback(
    async (/** @type {File[]} */ files) => {
      if (isTrashPath(currentPath)) {
        throw new Error('휴지통에는 파일을 추가할 수 없습니다.');
      }

      for (const file of files) {
        let base64 = await readFileAsBase64(file);
        let targetName = file.name;

        if (isHwpFileName(file.name)) {
          base64 = await convertHwpBase64ToHwpx(base64, file.name);
          targetName = toHwpxFileName(file.name);
        }

        await window.educowork.fs.writeFile(joinRelativePath(currentPath, targetName), base64);
      }
    },
    [currentPath],
  );

  const stat = useCallback(async (relativePath) => window.educowork.fs.stat(relativePath), []);

  const openInSystem = useCallback(async (relativePath) => {
    await window.educowork.fs.openPath(relativePath);
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
