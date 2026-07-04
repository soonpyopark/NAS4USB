import { NEW_FILE_TYPES, getDefaultFileName } from '../../lib/files/newFileFactory.js';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSelect: (type: import('../../lib/files/newFileFactory.js').NewFileType) => void,
 * }} props
 */
export default function NewFileDialog({ open, onClose, onSelect }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-nas-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">새 파일 만들기</h2>
            <p className="text-xs text-nas-muted">기본 이름: NoName</p>
          </div>
          <button type="button" className="nas-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {NEW_FILE_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className="rounded-lg border border-nas-border px-3 py-3 text-left transition-colors hover:border-nas-accent hover:bg-slate-50"
              onClick={() => onSelect(type.id)}
            >
              <span className="block text-sm font-semibold text-slate-800">{type.label}</span>
              <span className="mt-0.5 block font-mono text-xs text-slate-500">
                {getDefaultFileName(type.id)}
              </span>
              <span className="mt-1 block text-xs text-nas-muted">{type.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
