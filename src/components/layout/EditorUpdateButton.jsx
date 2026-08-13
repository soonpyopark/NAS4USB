import { useCallback, useState } from 'react';
import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';
import { EDITOR_CORES } from '../../../shared/editorCores.js';

/**
 * @param {{ variant?: 'button' | 'icon' }} [props]
 */
export default function EditorUpdateButton({ variant = 'button' }) {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  /** @type {[Record<string, { id: string, label: string, version: string, availableVersion: string, updateAvailable?: boolean }> | null, Function]} */
  const [coreStatus, setCoreStatus] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!window.nas4usb?.editors?.getStatus) {
      throw new Error(
        '에디터 API가 연결되지 않았습니다. preload 변경 반영을 위해 npm run dev를 다시 실행해 주세요.',
      );
    }
    const status = await window.nas4usb.editors.getStatus();
    setCoreStatus(status?.cores ?? {});
    return status;
  }, []);

  const openVersionDialog = useCallback(async () => {
    setLoadingStatus(true);
    setCoreStatus(null);
    setErrorMessage('');

    try {
      await refreshStatus();
      setDialogOpen(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '버전 정보를 불러올 수 없습니다.');
      setDialogOpen(true);
    } finally {
      setLoadingStatus(false);
    }
  }, [refreshStatus]);

  const cores = coreStatus
    ? EDITOR_CORES.map((core) => coreStatus[core.id]).filter(Boolean)
    : [];

  return (
    <>
      <button
        type="button"
        className={
          variant === 'icon'
            ? 'relative flex min-w-0 flex-1 items-center justify-center rounded-md py-2.5 text-slate-300 transition-colors hover:bg-nas-sidebarHover hover:text-white disabled:cursor-wait disabled:opacity-50'
            : 'inline-flex h-7 shrink-0 items-center rounded-md border border-slate-600 bg-slate-800 px-2.5 text-[10pt] font-medium leading-none text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50'
        }
        onClick={openVersionDialog}
        disabled={loadingStatus}
        title="에디터 버전 확인"
        aria-label={loadingStatus ? '버전 확인 중' : '에디터 버전 확인'}
      >
        {variant === 'icon' ? (
          <svg
            className={`h-5 w-5${loadingStatus ? ' animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5a5 5 0 0 1-8.66 3.46l-1.42 1.42A7 7 0 0 0 19 12c0-3.87-3.13-7-7-7zm-5 .54A7 7 0 0 0 5 12c0 3.87 3.13 7 7 7v3l4-4-4-4v3c-2.76 0-5-2.24-5-5 0-1.16.4-2.23 1.07-3.08L7 7.54z" />
          </svg>
        ) : loadingStatus ? (
          '버전 확인…'
        ) : (
          '에디터 버전 확인'
        )}
      </button>

      <AppModal
        open={dialogOpen}
        wide
        className="modal-dialog--editors"
        onClose={() => setDialogOpen(false)}
        title="에디터 버전 확인"
      >
        {errorMessage ? (
          <p className="modal-body !mb-4 whitespace-pre-wrap text-sm text-red-700">{errorMessage}</p>
        ) : (
          <div className="modal-body space-y-3 !mb-4 !text-[#323130]">
            <p className="text-sm text-slate-600">현재 앱에 포함된 에디터 코어 버전입니다.</p>

            <div className="overflow-hidden rounded border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">에디터</th>
                    <th className="px-3 py-2 font-medium">현재 버전</th>
                    <th className="px-3 py-2 font-medium">최신 버전</th>
                  </tr>
                </thead>
                <tbody>
                  {cores.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{item.label}</td>
                      <td className="px-3 py-2 break-all text-slate-700">{item.version}</td>
                      <td
                        className={`px-3 py-2 break-all ${
                          item.updateAvailable ? 'font-medium text-amber-700' : 'text-slate-600'
                        }`}
                      >
                        {item.availableVersion}
                        {item.updateAvailable ? ' (새 버전)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AppModalActions>
          <AppModalButton variant="primary" onClick={() => setDialogOpen(false)}>
            확인
          </AppModalButton>
        </AppModalActions>
      </AppModal>
    </>
  );
}
