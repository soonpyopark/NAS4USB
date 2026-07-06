import { AppModal, AppModalActions, AppModalButton } from '../common/AppModal.jsx';

function EditorUpdateDialog({ result, onClose }) {
  return (
    <AppModal open={Boolean(result)} onClose={onClose} title="에디터 업데이트 결과">
      {result && (
        <>
          <ul className="modal-body space-y-2 !mb-4 !text-[#323130]">
            {result.results.map((item) => (
              <li
                key={item.id}
                className={`rounded border px-3 py-2 ${
                  item.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <p className="font-medium">{item.label}</p>
                <p className="text-xs opacity-90">{item.message}</p>
                {item.previousVersion && item.version && item.previousVersion !== item.version && (
                  <p className="mt-1 text-xs opacity-75">
                    {item.previousVersion} → {item.version}
                  </p>
                )}
                {item.version && !item.previousVersion && (
                  <p className="mt-1 text-xs opacity-75">버전: {item.version}</p>
                )}
              </li>
            ))}
          </ul>

          <AppModalActions>
            <AppModalButton variant="primary" onClick={onClose}>
              확인
            </AppModalButton>
          </AppModalActions>
        </>
      )}
    </AppModal>
  );
}

export default EditorUpdateDialog;
