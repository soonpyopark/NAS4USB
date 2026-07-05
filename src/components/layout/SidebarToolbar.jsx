function ToolbarButton({ title, onClick, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-300 transition-colors hover:bg-nas-sidebarHover hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function SidebarToolbar({
  onCreateFolder,
  onCreateFile,
  onUpload,
  onDownload,
  canDownload = false,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  onPaste,
  canPaste,
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-700 px-2 py-2">
      <ToolbarButton title="새 폴더" onClick={onCreateFolder}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          <path d="M12 11v6M9 14h6" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="새 파일" onClick={onCreateFile}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M12 11v6M9 14h6" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="업로드" onClick={onUpload}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12M7 8l5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="다운로드" onClick={onDownload} disabled={!canDownload}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21V9M7 14l5 5 5-5" />
          <path d="M5 3h14" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="붙여넣기" onClick={onPaste} disabled={!canPaste}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-slate-600" />
      <ToolbarButton title="새로고침" onClick={onRefresh}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="모두 펼치기" onClick={onExpandAll}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 6l5 5 5-5M7 13l5 5 5-5" />
        </svg>
      </ToolbarButton>
      <ToolbarButton title="모두 접기" onClick={onCollapseAll}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 11l5-5 5 5M7 18l5-5 5 5" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
