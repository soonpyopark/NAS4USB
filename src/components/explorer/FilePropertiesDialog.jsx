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

export default function FilePropertiesDialog({ entry, statInfo, onClose }) {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-nas-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">속성</h2>
          <button type="button" className="nas-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        <dl className="space-y-3 px-4 py-4 text-sm">
          <div>
            <dt className="text-xs text-nas-muted">이름</dt>
            <dd className="font-medium text-slate-800">{statInfo?.name ?? entry.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-nas-muted">종류</dt>
            <dd>{entry.isDirectory ? '폴더' : entry.extension?.toUpperCase() || '파일'}</dd>
          </div>
          <div>
            <dt className="text-xs text-nas-muted">경로</dt>
            <dd className="break-all font-mono text-xs text-slate-700">{entry.relativePath}</dd>
          </div>
          <div>
            <dt className="text-xs text-nas-muted">크기</dt>
            <dd>{entry.isDirectory ? '—' : formatSize(statInfo?.size ?? entry.size)}</dd>
          </div>
          <div>
            <dt className="text-xs text-nas-muted">생성일</dt>
            <dd>{statInfo?.createdAt ? formatDate(statInfo.createdAt) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-nas-muted">수정일</dt>
            <dd>{formatDate(statInfo?.modifiedAt ?? entry.modifiedAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
