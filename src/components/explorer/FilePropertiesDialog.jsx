import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';

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
 *   fileStatus?: { isPrivate: boolean, isViewRestricted: boolean, isSharing: boolean } | null,
 *   isAdminLoggedIn?: boolean,
 *   accessSaving?: boolean,
 *   onChangePrivate?: (checked: boolean) => void,
 *   onChangeViewRestricted?: (checked: boolean) => void,
 *   onChangeShare?: (checked: boolean) => void,
 *   onClose: () => void,
 * }} props
 */
export default function FilePropertiesDialog({
  entry,
  statInfo,
  fileStatus,
  isAdminLoggedIn = false,
  accessSaving = false,
  onChangePrivate,
  onChangeViewRestricted,
  onChangeShare,
  onClose,
}) {
  const canEditAccessOptions = isAdminLoggedIn;
  const resolvedFileStatus =
    fileStatus ??
    (entry && !entry.isDirectory
      ? { isPrivate: false, isViewRestricted: false, isSharing: false }
      : null);
  const showAccessOptions = Boolean(entry && !entry.isDirectory);

  return (
    <AppModal open={Boolean(entry)} onClose={onClose} title="속성">
      {entry && (
        <>
          <dl className="modal-properties">
            <div>
              <dt>이름</dt>
              <dd className="font-medium">{statInfo?.name ?? entry.name}</dd>
            </div>
            <div>
              <dt>종류</dt>
              <dd>{entry.isDirectory ? '폴더' : entry.extension?.toUpperCase() || '파일'}</dd>
            </div>
            <div>
              <dt>경로</dt>
              <dd className="break-all font-mono text-xs">{entry.relativePath}</dd>
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
                  checked={resolvedFileStatus.isSharing}
                  disabled={accessSaving || !canEditAccessOptions}
                  onChange={(event) => onChangeShare?.(event.target.checked)}
                />
                <span>공유</span>
              </label>
              {!canEditAccessOptions && (
                <p className="modal-access-hint">총괄관리자 로그인 시 변경할 수 있습니다.</p>
              )}
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
