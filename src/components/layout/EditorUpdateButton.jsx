import { useState } from 'react';
import EditorUpdateDialog from './EditorUpdateDialog.jsx';
import { AppConfirmDialog } from '../common/AppModal.jsx';

export default function EditorUpdateButton() {
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runEditorUpdate = async () => {
    setConfirmOpen(false);
    setUpdating(true);
    setUpdateResult(null);

    try {
      if (!window.educowork?.editors?.update) {
        throw new Error(
          '에디터 API가 연결되지 않았습니다. preload 변경 반영을 위해 npm run dev를 다시 실행해 주세요.',
        );
      }

      const result = await window.educowork.editors.update();
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

  return (
    <>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center rounded-md border border-slate-600 bg-slate-800 px-2.5 text-[10pt] font-medium leading-none text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
        onClick={() => setConfirmOpen(true)}
        disabled={updating}
        title="HWPX · WB4S · FortuneSheet 코어를 USB에 반영"
      >
        {updating ? '업데이트 중…' : '에디터 업데이트'}
      </button>

      <AppConfirmDialog
        open={confirmOpen}
        title="에디터 업데이트"
        body={
          '에디터 코어를 USB에 업데이트할까요?\n\n' +
          '- HWPX (rhwp): npm @rhwp/core, @rhwp/editor\n' +
          '- 화이트보드 (wb4s): vendor/whiteboard4share (see UPSTREAM.md)\n' +
          '- 엑셀 (FortuneSheet): npm @fortune-sheet/react\n\n' +
          'Git submodule 또는 lib/updates/ 패키지를 사용하는 코어는 해당 방식으로 반영됩니다.'
        }
        confirmLabel="업데이트"
        onConfirm={runEditorUpdate}
        onCancel={() => setConfirmOpen(false)}
      />

      <EditorUpdateDialog result={updateResult} onClose={() => setUpdateResult(null)} />
    </>
  );
}
