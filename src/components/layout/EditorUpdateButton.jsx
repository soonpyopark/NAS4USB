import { useCallback, useState } from 'react';
import EditorUpdateDialog from './EditorUpdateDialog.jsx';
import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';
import { EDITOR_CORES } from '../../../shared/editorCores.js';

export default function EditorUpdateButton() {
  const [updating, setUpdating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** @type {[Record<string, { id: string, label: string, version: string, availableVersion: string, updateAvailable?: boolean }> | null, Function]} */
  const [coreStatus, setCoreStatus] = useState(null);

  const openConfirm = useCallback(async () => {
    setLoadingStatus(true);
    setCoreStatus(null);

    try {
      if (!window.nas4usb?.editors?.getStatus) {
        throw new Error(
          '에디터 API가 연결되지 않았습니다. preload 변경 반영을 위해 npm run dev를 다시 실행해 주세요.',
        );
      }

      const status = await window.nas4usb.editors.getStatus();
      setCoreStatus(status?.cores ?? {});
      setConfirmOpen(true);
    } catch (error) {
      setUpdateResult({
        success: false,
        results: [
          {
            id: 'error',
            label: '상태 조회 오류',
            success: false,
            message: error instanceof Error ? error.message : '알 수 없는 오류',
          },
        ],
      });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const runEditorUpdate = async () => {
    setConfirmOpen(false);
    setUpdating(true);
    setUpdateResult(null);

    try {
      if (!window.nas4usb?.editors?.update) {
        throw new Error(
          '에디터 API가 연결되지 않았습니다. preload 변경 반영을 위해 npm run dev를 다시 실행해 주세요.',
        );
      }

      const result = await window.nas4usb.editors.update();
      setUpdateResult(result);
    } catch (error) {
      setUpdateResult({
        success: false,
        results: [
          {
            id: 'error',
            label: '업데이트 오류',
            success: false,
            message: error instanceof Error ? error.message : '알 수 없는 오류',
          },
        ],
      });
    } finally {
      setUpdating(false);
    }
  };

  const cores = coreStatus
    ? EDITOR_CORES.map((core) => coreStatus[core.id]).filter(Boolean)
    : [];

  return (
    <>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-600 bg-slate-800 px-2.5 text-[10pt] font-medium leading-none text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
        onClick={openConfirm}
        disabled={updating || loadingStatus}
        title="HWPX · HTML · WB4S · FortuneSheet 코어를 USB에 반영"
      >
        {updating ? '업데이트 중…' : loadingStatus ? '버전 확인…' : '에디터 업데이트'}
      </button>

      <AppModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="에디터 업데이트"
      >
        <div className="modal-body space-y-3 !mb-4 !text-[#323130]">
          <p className="text-sm text-slate-600">
            에디터 코어를 USB에 업데이트합니다. npm 패키지는 registry 최신 버전으로 설치됩니다.
          </p>

          <div className="overflow-hidden rounded border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">에디터</th>
                  <th className="px-3 py-2 font-medium">현재 버전</th>
                  <th className="px-3 py-2 font-medium">업데이트 가능</th>
                </tr>
              </thead>
              <tbody>
                {cores.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{item.label}</td>
                    <td className="px-3 py-2 text-slate-700 break-all">{item.version}</td>
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

        <AppModalActions>
          <AppModalButton variant="secondary" onClick={() => setConfirmOpen(false)}>
            취소
          </AppModalButton>
          <AppModalButton variant="primary" onClick={runEditorUpdate}>
            업데이트
          </AppModalButton>
        </AppModalActions>
      </AppModal>

      <EditorUpdateDialog result={updateResult} onClose={() => setUpdateResult(null)} />
    </>
  );
}
