import { formatExternalRelativePath, labelForExternalMountPath } from '../../../shared/externalFolders.js';
import { useExternalFolders } from '../../hooks/useExternalFolders.js';
import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';
import { entryExtensionOf, isSecFileName } from '../../lib/filePassword/secPaths.js';
import FolderColorSwatches from './FolderColorSwatches.jsx';
import { fileTypeColorClass } from './FileIcon.jsx';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * @param {{
 *   entry: { name?: string, relativePath: string, isDirectory?: boolean, extension?: string, size?: number, modifiedAt?: string } | null,
 *   statInfo?: { name?: string, size?: number, createdAt?: string, modifiedAt?: string } | null,
 *   fileStatus?: {
 *     isPrivate: boolean,
 *     isViewRestricted: boolean,
 *     isShareViewOnly?: boolean,
 *     isShareEditable?: boolean,
 *     isFavorite?: boolean,
 *   } | null,
 *   isFavorite?: boolean,
 *   isAdminLoggedIn?: boolean,
 *   accessSaving?: boolean,
 *   onChangePrivate?: (checked: boolean) => void,
 *   onChangeViewRestricted?: (checked: boolean) => void,
 *   onChangeShareView?: (checked: boolean) => void,
 *   onChangeShareEdit?: (checked: boolean) => void,
 *   onChangeFavorite?: (checked: boolean) => void,
 *   folderColor?: string,
 *   canChangeFolderColor?: boolean,
 *   onChangeFolderColor?: (color: string) => void,
 *   nameBold?: boolean,
 *   canChangeNameBold?: boolean,
 *   onChangeNameBold?: (checked: boolean) => void,
 *   onClose: () => void,
 * }} props
 */
export default function FilePropertiesDialog({
  entry,
  statInfo,
  fileStatus,
  isFavorite = false,
  isAdminLoggedIn = false,
  accessSaving = false,
  onChangePrivate,
  onChangeViewRestricted,
  onChangeShareView,
  onChangeShareEdit,
  onChangeFavorite,
  folderColor = '',
  canChangeFolderColor = false,
  onChangeFolderColor,
  nameBold = false,
  canChangeNameBold = false,
  onChangeNameBold,
  onClose,
}) {
  const externalFolders = useExternalFolders();
  const displayName =
    labelForExternalMountPath(entry?.relativePath, externalFolders) ||
    entry?.name ||
    statInfo?.name ||
    '';
  const displayPath = entry
    ? formatExternalRelativePath(entry.relativePath, externalFolders)
    : '';
  const canEditAccessOptions = isAdminLoggedIn;
  const resolvedFileStatus =
    fileStatus ??
    (entry && !entry.isDirectory
      ? {
          isPrivate: false,
          isViewRestricted: false,
          isShareViewOnly: false,
          isShareEditable: false,
          isFavorite: false,
        }
      : null);
  const showAccessOptions = Boolean(entry && !entry.isDirectory);
  const showFolderFavorite = Boolean(entry?.isDirectory);

  return (
    <AppModal open={Boolean(entry)} onClose={onClose} title="속성">
      {entry && (
        <>
          <dl className="modal-properties">
            <div>
              <dt>이름</dt>
              <dd className="font-medium">{displayName}</dd>
            </div>
            <div>
              <dt>종류</dt>
              <dd
                className={
                  entry.isDirectory
                    ? undefined
                    : fileTypeColorClass(entryExtensionOf(entry) || entry.extension)
                }
              >
                {entry.isDirectory
                  ? '폴더'
                  : `${(entryExtensionOf(entry) || entry.extension || '파일').toUpperCase()}${
                      isSecFileName(entry.name || entry.relativePath) ? ' · 잠금' : ''
                    }`}
              </dd>
            </div>
            <div>
              <dt>경로</dt>
              <dd className="break-all font-mono text-xs">{displayPath}</dd>
            </div>
            <div>
              <dt>크기</dt>
              <dd>{entry.isDirectory ? '—' : formatSize(statInfo?.size ?? entry.size)}</dd>
            </div>
            <div>
              <dt>생성일</dt>
              <dd>{statInfo?.createdAt ? formatDate(statInfo.createdAt) : '—'}</dd>
            </div>
            <div>
              <dt>수정일</dt>
              <dd>{formatDate(statInfo?.modifiedAt ?? entry.modifiedAt)}</dd>
            </div>
          </dl>

          <div className="modal-access-options">
            <label className={`modal-access-option${canChangeNameBold ? '' : ' modal-access-option--readonly'}`}>
              <input
                type="checkbox"
                checked={Boolean(nameBold)}
                disabled={accessSaving || !canChangeNameBold}
                onChange={(event) => onChangeNameBold?.(event.target.checked)}
              />
              <span>주요 파일</span>
            </label>
            <p className="modal-access-hint">
              {canChangeNameBold
                ? '이 폴더에서 주요 파일로 표시합니다. 목록에서 별 아이콘과 굵은 이름으로 구분됩니다.'
                : '주요 파일 표시는 쓰기 권한이 있을 때 변경할 수 있습니다.'}
            </p>
          </div>

          {showAccessOptions && resolvedFileStatus && (
            <div className="modal-access-options">
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={resolvedFileStatus.isPrivate}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangePrivate?.(event.target.checked)}
                />
                <span>비공개</span>
              </label>
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={resolvedFileStatus.isViewRestricted}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeViewRestricted?.(event.target.checked)}
                />
                <span>열람제한</span>
              </label>
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(resolvedFileStatus.isShareViewOnly)}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeShareView?.(event.target.checked)}
                />
                <span>공유(보기 전용)</span>
              </label>
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(resolvedFileStatus.isShareEditable)}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeShareEdit?.(event.target.checked)}
                />
                <span>공유(편집 가능)</span>
              </label>
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(resolvedFileStatus.isFavorite)}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeFavorite?.(event.target.checked)}
                />
                <span>즐겨찾기</span>
              </label>
              {!canEditAccessOptions && (
                <p className="modal-access-hint">비공개·열람제한·공유·즐겨찾기는 총괄관리자만 변경할 수 있습니다.</p>
              )}
            </div>
          )}

          {showFolderFavorite && (
            <div className="modal-access-options">
              <label className={`modal-access-option${canEditAccessOptions ? '' : ' modal-access-option--readonly'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(isFavorite)}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeFavorite?.(event.target.checked)}
                />
                <span>즐겨찾기 추가</span>
              </label>
              <p className="modal-access-hint">
                {canEditAccessOptions
                  ? '즐겨찾기한 폴더는 왼쪽 아래 폴더 즐겨찾기에서 바로 열 수 있습니다.'
                  : '즐겨찾기는 총괄관리자만 변경할 수 있습니다.'}
              </p>
              <div>
                <div className="mb-2 text-sm text-slate-700">폴더 색</div>
                <FolderColorSwatches
                  value={folderColor}
                  disabled={accessSaving || !canChangeFolderColor}
                  onChange={(color) => onChangeFolderColor?.(color)}
                />
                <p className="modal-access-hint folder-color-hint">
                  {canChangeFolderColor
                    ? '맨 오른쪽 무지개 칸에서 원하는 색을 고를 수 있습니다. 지정하지 않으면 폴더 깊이에 따라 색이 정해집니다.'
                    : '폴더 색은 쓰기 권한이 있을 때 변경할 수 있습니다.'}
                </p>
              </div>
            </div>
          )}

          <AppModalActions>
            <AppModalButton onClick={onClose}>닫기</AppModalButton>
          </AppModalActions>
        </>
      )}
    </AppModal>
  );
}
