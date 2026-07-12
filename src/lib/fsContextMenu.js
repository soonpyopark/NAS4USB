import { isTrashPath } from './trashPaths.js';

/**
 * @param {{
 *   entry: { relativePath: string, isDirectory: boolean } | null,
 *   targetCount?: number,
 *   hasClipboard: boolean,
 *   isInTrashView?: boolean,
 *   onOpen: (entry: { relativePath: string, isDirectory: boolean }) => void,
 *   onOpenSystem?: (entry: { relativePath: string, isDirectory: boolean }) => void,
 *   onUpload?: (targetPath: string) => void,
 *   onCopy: () => void,
 *   onCut: () => void,
 *   onMove: () => void,
 *   onPaste: (targetPath: string) => void,
 *   onRename: () => void,
 *   onDuplicate: () => void,
 *   onDelete: () => void,
 *   onRestore?: () => void,
 *   onPermanentDelete?: () => void,
 *   onProperties: () => void,
 *   onDownload?: () => void,
 *   canDownload?: boolean,
 *   canEditOpen?: boolean,
 *   isAdminLoggedIn?: boolean,
 *   canWrite?: boolean,
 * }} options
 */
export function buildEntryContextMenuItems({
  entry,
  targetCount = entry ? 1 : 0,
  hasClipboard,
  isInTrashView = false,
  onOpen,
  onOpenSystem,
  onUpload,
  onCopy,
  onCut,
  onMove,
  onPaste,
  onRename,
  onDuplicate,
  onDelete,
  onRestore,
  onPermanentDelete,
  onProperties,
  onDownload,
  canDownload = false,
  canEditOpen = true,
  isAdminLoggedIn = true,
  canWrite = true,
}) {
  const showTrashMenu = Boolean(entry && isTrashPath(entry.relativePath));

  if (showTrashMenu) {
    if (!canWrite) {
      return [];
    }

    return [
      {
        id: 'restore',
        label: '복원',
        disabled: targetCount === 0,
        onClick: () => onRestore?.(),
      },
      {
        id: 'permanent-delete',
        label: '영구 삭제',
        danger: true,
        disabled: targetCount === 0,
        onClick: () => onPermanentDelete?.(),
      },
      {
        id: 'properties',
        label: '속성',
        disabled: targetCount !== 1,
        onClick: onProperties,
      },
    ];
  }

  if (!canWrite) {
    if (entry?.isDirectory) {
      return [
        {
          id: 'open',
          label: '폴더 열기',
          disabled: !entry,
          onClick: () => entry && onOpen(entry),
        },
        {
          id: 'open-system',
          label: '시스템으로 열기',
          disabled: !entry || !onOpenSystem,
          onClick: () => entry && onOpenSystem?.(entry),
        },
        {
          id: 'properties',
          label: '속성',
          disabled: targetCount !== 1,
          onClick: onProperties,
        },
      ];
    }

    return [
      {
        id: 'open',
        label: '편집 열기',
        disabled: !entry || !canEditOpen,
        onClick: () => entry && onOpen(entry),
      },
      {
        id: 'open-system',
        label: '시스템으로 열기',
        disabled: !entry || entry.isDirectory || !onOpenSystem,
        onClick: () => entry && onOpenSystem?.(entry),
      },
      {
        id: 'download',
        label: '다운로드',
        disabled: !onDownload || !canDownload,
        onClick: () => onDownload?.(),
      },
      {
        id: 'properties',
        label: '속성',
        disabled: targetCount !== 1,
        onClick: onProperties,
      },
    ];
  }

  const pasteTarget = entry?.isDirectory ? entry.relativePath : null;
  const sharedItems = [
    { id: 'copy', label: '복사', disabled: targetCount === 0, onClick: onCopy },
    { id: 'cut', label: '잘라내기', disabled: targetCount === 0, onClick: onCut },
    { id: 'move', label: '이동', disabled: targetCount === 0, onClick: onMove },
    {
      id: 'paste',
      label: '붙여넣기',
      disabled: !hasClipboard || !pasteTarget,
      onClick: () => pasteTarget && onPaste(pasteTarget),
    },
    {
      id: 'rename',
      label: '이름 변경',
      disabled: targetCount !== 1,
      onClick: onRename,
    },
    {
      id: 'duplicate',
      label: '복제',
      disabled: targetCount !== 1,
      onClick: onDuplicate,
    },
    {
      id: 'delete',
      label: '휴지통으로',
      danger: true,
      disabled: targetCount === 0,
      onClick: onDelete,
    },
    {
      id: 'properties',
      label: '속성',
      disabled: targetCount !== 1,
      onClick: onProperties,
    },
  ];

  if (entry?.isDirectory) {
    return [
      {
        id: 'open',
        label: '폴더 열기',
        disabled: !entry,
        onClick: () => entry && onOpen(entry),
      },
      {
        id: 'open-system',
        label: '시스템으로 열기',
        disabled: !entry || !onOpenSystem,
        onClick: () => entry && onOpenSystem?.(entry),
      },
      {
        id: 'upload',
        label: '업로드',
        disabled: !entry || !onUpload,
        onClick: () => entry && onUpload?.(entry.relativePath),
      },
      {
        id: 'download',
        label: '다운로드',
        disabled: !onDownload || !canDownload,
        onClick: () => onDownload?.(),
      },
      ...sharedItems,
    ];
  }

  return [
    {
      id: 'open',
      label: '편집 열기',
      disabled: !entry || !canEditOpen,
      onClick: () => entry && onOpen(entry),
    },
    {
      id: 'open-system',
      label: '시스템으로 열기',
      disabled: !entry || entry.isDirectory || !onOpenSystem,
      onClick: () => entry && onOpenSystem?.(entry),
    },
    {
      id: 'download',
      label: '다운로드',
      disabled: !onDownload || !canDownload,
      onClick: () => onDownload?.(),
    },
    ...sharedItems,
  ];
}

/**
 * @param {{
 *   targetPath: string,
 *   hasClipboard: boolean,
 *   isInTrashView?: boolean,
 *   isInFavoritesView?: boolean,
 *   onCreateFolder: () => void,
 *   onCreateFile: () => void,
 *   onUpload: () => void,
 *   onPaste: (targetPath: string) => void,
 *   onRefresh: () => void,
 *   onEmptyTrash?: () => void,
 *   isAdminLoggedIn?: boolean,
 *   canWrite?: boolean,
 * }} options
 */
export function buildBackgroundContextMenuItems({
  targetPath,
  hasClipboard,
  isInTrashView = false,
  isInFavoritesView = false,
  onCreateFolder,
  onCreateFile,
  onUpload,
  onPaste,
  onRefresh,
  onEmptyTrash,
  isAdminLoggedIn = true,
  canWrite = true,
}) {
  if (isInFavoritesView) {
    return [{ id: 'refresh', label: '새로고침', onClick: onRefresh }];
  }

  const showTrashMenu = isTrashPath(targetPath);

  if (showTrashMenu) {
    if (!canWrite) {
      return [{ id: 'refresh', label: '새로고침', onClick: onRefresh }];
    }
    return [
      {
        id: 'empty-trash',
        label: '휴지통 비우기',
        danger: true,
        onClick: () => onEmptyTrash?.(),
      },
      { id: 'refresh', label: '새로고침', onClick: onRefresh },
    ];
  }

  if (!canWrite) {
    return [{ id: 'refresh', label: '새로고침', onClick: onRefresh }];
  }

  return [
    { id: 'newfolder', label: '새 폴더', onClick: onCreateFolder },
    { id: 'newfile', label: '새 파일', onClick: onCreateFile },
    { id: 'upload', label: '업로드', onClick: onUpload },
    {
      id: 'paste',
      label: '붙여넣기',
      disabled: !hasClipboard,
      onClick: () => onPaste(targetPath),
    },
    { id: 'refresh', label: '새로고침', onClick: onRefresh },
  ];
}
