import { useCallback, useState } from 'react';
import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';
import { EDITOR_CORES } from '../../../shared/editorCores.js';

/** Vite production build strips this branch (배포 빌드에 업데이트 UI 미포함). */
const IS_DEV_BUILD = import.meta.env.DEV;

export default function EditorUpdateButton() {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
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
    setUpdateMessage('');

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

  const handleDevUpdate = useCallback(async () => {
    if (!IS_DEV_BUILD) return;
    setUpdating(true);
    setErrorMessage('');
    setUpdateMessage('');

    try {
      if (!window.nas4usb?.editors?.update) {
        throw new Error(
          '에디터 업데이트 API를 사용할 수 없습니다. npm run dev를 다시 실행해 주세요.',
        );
      }
      const result = await window.nas4usb.editors.update();
      await refreshStatus();

      const lines = (result?.results ?? []).map((item) => {
        const mark = item.success ? 'OK' : 'FAIL';
        return `${mark} ${item.label}: ${item.message}`;
      });
      const summary = result?.success
        ? '모든 에디터 코어 업데이트가 완료되었습니다. 반영을 위해 앱을 재시작해 주세요.'
        : result?.partial
          ? '일부 에디터 코어만 업데이트되었습니다. 앱을 재시작한 뒤 다시 확인해 주세요.'
          : '에디터 코어 업데이트에 실패했습니다.';
      setUpdateMessage([summary, ...lines].join('\n'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '업데이트에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  }, [refreshStatus]);

  const cores = coreStatus
    ? EDITOR_CORES.map((core) => coreStatus[core.id]).filter(Boolean)
    : [];
  const hasUpdate = cores.some((item) => item.updateAvailable);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-600 bg-slate-800 px-2.5 text-[10pt] font-medium leading-none text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
        onClick={openVersionDialog}
        disabled={loadingStatus || updating}
        title="HWPX · HTML · WB4S · FortuneSheet 코어 버전 확인"
      >
        {loadingStatus ? '버전 확인…' : '에디터 버전 확인'}
      </button>

      <AppModal
        open={dialogOpen}
        onClose={() => {
          if (updating) return;
          setDialogOpen(false);
        }}
        title="에디터 버전 확인"
      >
        {errorMessage ? (
          <p className="modal-body !mb-4 whitespace-pre-wrap text-sm text-red-700">{errorMessage}</p>
        ) : (
          <div className="modal-body space-y-3 !mb-4 !text-[#323130]">
            <p className="text-sm text-slate-600">
              현재 앱에 포함된 에디터 코어 버전입니다.
              {IS_DEV_BUILD
                ? ' 개발 모드에서는 아래 「개발용 업데이트」로 프로젝트 폴더의 코어를 갱신할 수 있습니다. 포터블 exe 반영은 별도 빌드가 필요합니다.'
                : ' 포터블 exe에 반영하려면 `update_all.bat build` 또는 `npm run build:dist:exe`로 다시 빌드해 주세요.'}
            </p>

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

            {updateMessage ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                {updateMessage}
              </pre>
            ) : null}
          </div>
        )}

        <AppModalActions>
          {IS_DEV_BUILD ? (
            <AppModalButton
              variant="primary"
              disabled={updating || Boolean(errorMessage)}
              onClick={() => void handleDevUpdate()}
            >
              {updating
                ? '업데이트 중…'
                : hasUpdate
                  ? '개발용 업데이트'
                  : '개발용 업데이트 (강제)'}
            </AppModalButton>
          ) : null}
          <AppModalButton
            variant={IS_DEV_BUILD ? 'secondary' : 'primary'}
            disabled={updating}
            onClick={() => setDialogOpen(false)}
          >
            확인
          </AppModalButton>
        </AppModalActions>
      </AppModal>
    </>
  );
}
