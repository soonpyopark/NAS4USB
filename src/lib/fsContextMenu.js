import { entryExtensionOf } from './filePassword/secPaths.js';
import { isHtmlExtension, isImageExtension, isPdfExtension } from './media/mediaTypes.js';
import { isTrashPath } from './trashPaths.js';
import { isExternalContentPath, isExternalMountRoot } from './externalFoldersUi.js';
import { isExternalFolderContainerPath } from '../../shared/externalFolders.js';

/**
 * @param {{ relativePath?: string, isDirectory?: boolean, extension?: string } | null | undefined} entry
 */
function openFileMenuLabel(entry) {
  if (
    isImageExtension(entryExtensionOf(entry)) ||
    isPdfExtension(entryExtensionOf(entry)) ||
    isHtmlExtension(entryExtensionOf(entry))
  ) {
    return '바로 보기';
  }
  return '편집 열기';
}

/**
 * @param {{
 *   entry: { relativePath: string, isDirectory: boolean, extension?: string } | null,
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
 *   onSetPassword?: () => void,
 *   canSetPassword?: boolean,
 *   passwordActionLabel?: string,
 *   onExportHtml?: () => void,
 *   canExportHtml?: boolean,
 *   onToggleFavorite?: (favorited: boolean) => void,
 *   isFavorite?: boolean,
 *   onSetFolderColor?: (color: string) => void,
 *   folderColor?: string,
 *   onMoveOrder?: (delta: number) => void,
 *   canMoveOrderUp?: boolean,
 *   canMoveOrderDown?: boolean,
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
  onSetPassword,
  canSetPassword = false,
  passwordActionLabel = '비밀번호 설정',
  onExportHtml,
  canExportHtml = false,
  onToggleFavorite,
  isFavorite = false,
  onSetFolderColor,
  folderColor = '',
  onMoveOrder,
  canMoveOrderUp = false,
  canMoveOrderDown = false,
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
        label: '삭제(영구)',
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
        label: openFileMenuLabel(entry),
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
        id: 'export-html',
        label: 'HTML로 내보내기',
        disabled: !onExportHtml || !canExportHtml,
        onClick: () => onExportHtml?.(),
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
  const externalMountRoot = entry ? isExternalMountRoot(entry.relativePath) : false;
  const externalContainer = entry ? isExternalFolderContainerPath(entry.relativePath) : false;
  const externalContent = entry ? isExternalContentPath(entry.relativePath) : false;
  const sharedItems = [
    { id: 'copy', label: '복사', disabled: targetCount === 0 || externalMountRoot, onClick: onCopy },
    { id: 'cut', label: '잘라내기', disabled: targetCount === 0 || externalMountRoot, onClick: onCut },
    { id: 'move', label: '이동', disabled: targetCount === 0 || externalMountRoot, onClick: onMove },
    {
      id: 'paste',
      label: '붙여넣기',
      disabled: !hasClipboard || !pasteTarget || externalContainer,
      onClick: () => pasteTarget && onPaste(pasteTarget),
    },
    {
      id: 'rename',
      label: '이름 변경',
      disabled: targetCount !== 1 || externalMountRoot,
      onClick: onRename,
    },
    {
      id: 'duplicate',
      label: '복제',
      disabled: targetCount !== 1 || externalMountRoot,
      onClick: onDuplicate,
    },
    // External container/mounts: disconnect in settings only. External contents: permanent delete only.
    ...(externalMountRoot
      ? []
      : externalContent
        ? [
            {
              id: 'permanent-delete',
              label: '삭제(영구)',
              danger: true,
              disabled: targetCount === 0,
              onClick: () => onPermanentDelete?.(),
            },
          ]
        : [
            {
              id: 'delete',
              label: '삭제(휴지통)',
              danger: true,
              disabled: targetCount === 0,
              onClick: onDelete,
            },
            {
              id: 'permanent-delete',
              label: '삭제(영구)',
              danger: true,
              disabled: targetCount === 0,
              onClick: () => onPermanentDelete?.(),
            },
          ]),
    ...(onMoveOrder
      ? [
          {
            id: 'move-up',
            label: '위로',
            disabled: targetCount !== 1 || !canMoveOrderUp,
            onClick: () => onMoveOrder(-1),
          },
          {
            id: 'move-down',
            label: '아래로',
            disabled: targetCount !== 1 || !canMoveOrderDown,
            onClick: () => onMoveOrder(1),
          },
        ]
      : []),
    ...(onToggleFavorite && isAdminLoggedIn
      ? [
          {
            id: 'favorite',
            label: isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가',
            disabled: targetCount !== 1 || externalMountRoot,
            onClick: () => onToggleFavorite(!isFavorite),
          },
        ]
      : []),
    ...(entry?.isDirectory && onSetFolderColor
      ? [
          {
            id: 'folder-color',
            type: 'swatches',
            label: '폴더 색',
            value: folderColor,
            disabled: targetCount !== 1 || externalMountRoot || externalContainer,
            onSelect: (color) => onSetFolderColor(color),
          },
        ]
      : []),
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
        disabled: !entry || !onOpenSystem || externalContainer,
        onClick: () => entry && onOpenSystem?.(entry),
      },
      {
        id: 'upload',
        label: '업로드',
        disabled: !entry || !onUpload || externalContainer,
        onClick: () => entry && onUpload?.(entry.relativePath),
      },
      {
        id: 'download',
        label: '다운로드',
        disabled: !onDownload || !canDownload || externalContainer,
        onClick: () => onDownload?.(),
      },
      ...sharedItems,
    ];
  }

  return [
    {
      id: 'open',
      label: openFileMenuLabel(entry),
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
      id: 'export-html',
      label: 'HTML로 내보내기',
      disabled: !onExportHtml || !canExportHtml,
      onClick: () => onExportHtml?.(),
    },
    {
      id: 'set-password',
      label: passwordActionLabel,
      disabled: !onSetPassword || !canSetPassword || !canWrite,
      onClick: () => onSetPassword?.(),
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
