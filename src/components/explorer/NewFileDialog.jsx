import { NEW_FILE_TYPES, getDefaultFileName } from '../../lib/files/newFileFactory.js';
import { AppModal, AppModalActions, AppModalBody, AppModalButton } from '../common/AppModal.jsx';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSelect: (type: import('../../lib/files/newFileFactory.js').NewFileType) => void,
 * }} props
 */
export default function NewFileDialog({ open, onClose, onSelect }) {
  return (
    <AppModal open={open} onClose={onClose} title="새 파일 만들기" wide>
      <AppModalBody>기본 이름: NoName</AppModalBody>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {NEW_FILE_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className="rounded border border-[#e1dfdd] px-3 py-3 text-left transition-colors hover:border-[#0078d4] hover:bg-[#f3f2f1]"
            onClick={() => onSelect(type.id)}
          >
            <span className="block text-sm font-semibold text-[#323130]">{type.label}</span>
            <span className="mt-0.5 block font-mono text-xs text-[#605e5c]">
              {getDefaultFileName(type.id)}
            </span>
            <span className="mt-1 block text-xs text-[#605e5c]">{type.description}</span>
          </button>
        ))}
      </div>

      <AppModalActions>
        <AppModalButton onClick={onClose}>취소</AppModalButton>
      </AppModalActions>
    </AppModal>
  );
}
