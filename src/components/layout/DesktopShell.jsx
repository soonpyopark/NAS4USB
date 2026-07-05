import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import StatusBar from './StatusBar.jsx';

export default function DesktopShell({
  children,
  paths,
  syncInfo,
  infoLoading,
  currentPath,
  fsRevision = 0,
  onNavigate,
  onHome,
  onOpenFile,
  onFsChanged,
}) {
  return (
    <div className="flex h-full flex-col bg-slate-100">
      <TopBar syncInfo={syncInfo} infoLoading={infoLoading} onHome={onHome} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          currentPath={currentPath}
          fsRevision={fsRevision}
          syncInfo={syncInfo}
          onNavigate={onNavigate}
          onOpenFile={onOpenFile}
          onFsChanged={onFsChanged}
        />

        <main className="hidden min-w-0 flex-1 flex-col p-4 md:flex">
          <div className="nas-panel flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </main>
      </div>

      <StatusBar paths={paths} syncInfo={syncInfo} currentPath={currentPath} />
    </div>
  );
}
