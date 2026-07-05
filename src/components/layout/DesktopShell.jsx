import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import StatusBar from './StatusBar.jsx';

const SIDEBAR_DEFAULT_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_RATIO = 0.5;

export default function DesktopShell({
  children,
  paths,
  syncInfo,
  infoLoading,
  currentPath,
  onNavigate,
  onHome,
  onOpenFile,
}) {
  const layoutRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);

  const clampSidebarWidth = useCallback((nextWidth, containerWidth) => {
    const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, containerWidth * SIDEBAR_MAX_RATIO);
    return Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, nextWidth));
  }, []);

  const handleResizeStart = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (event) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const rect = layout.getBoundingClientRect();
      setSidebarWidth(clampSidebarWidth(event.clientX - rect.left, rect.width));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.classList.add('sidebar-resize-active');
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.classList.remove('sidebar-resize-active');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [clampSidebarWidth, isResizing]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const containerWidth = entry.contentRect.width;
      setLayoutWidth(containerWidth);
      setSidebarWidth((current) => clampSidebarWidth(current, containerWidth));
    });

    observer.observe(layout);
    return () => observer.disconnect();
  }, [clampSidebarWidth]);

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <TopBar syncInfo={syncInfo} infoLoading={infoLoading} onHome={onHome} />

      <div ref={layoutRef} className="flex min-h-0 flex-1">
        <div
          className="sidebar-panel relative flex min-h-0 min-w-0 flex-1 flex-col md:flex-none md:shrink-0"
          style={{ ['--sidebar-width']: `${sidebarWidth}px` }}
        >
          <Sidebar
            currentPath={currentPath}
            syncInfo={syncInfo}
            onNavigate={onNavigate}
            onOpenFile={onOpenFile}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 너비 조절"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={Math.max(SIDEBAR_MIN_WIDTH, Math.round(layoutWidth * SIDEBAR_MAX_RATIO))}
          aria-valuenow={sidebarWidth}
          className={`sidebar-resize-handle hidden shrink-0 md:block ${isResizing ? 'sidebar-resize-handle--active' : ''}`}
          onMouseDown={handleResizeStart}
        />

        <main className="hidden min-w-0 flex-1 flex-col p-4 md:flex">
          <div className="nas-panel flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </main>
      </div>

      <StatusBar paths={paths} syncInfo={syncInfo} currentPath={currentPath} />
    </div>
  );
}
