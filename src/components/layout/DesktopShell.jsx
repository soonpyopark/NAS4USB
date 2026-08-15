import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import StatusBar from './StatusBar.jsx';

const SIDEBAR_DEFAULT_WIDTH = 288;
/** Do not allow shrinking below the initial startup width. */
const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;
const SIDEBAR_MAX_RATIO = 0.5;
/** Below this width: one pane at a time (folder | files). */
const COMPACT_LAYOUT_MAX = 900;
const SIDEBAR_COLLAPSED_KEY = 'nas4usb.sidebarCollapsed';

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DesktopShell({
  children,
  paths,
  syncInfo,
  infoLoading,
  currentPath,
  mainView = 'explorer',
  settingsOpen = false,
  onNavigate,
  onOpenSettings,
  onOpenFile,
}) {
  const layoutRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobilePane, setMobilePane] = useState(/** @type {'folders' | 'files'} */ ('files'));

  const isCompact = layoutWidth > 0 && layoutWidth < COMPACT_LAYOUT_MAX;

  const clampSidebarWidth = useCallback((nextWidth, containerWidth) => {
    const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, containerWidth * SIDEBAR_MAX_RATIO);
    return Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, nextWidth));
  }, []);

  const setCollapsed = useCallback((next) => {
    setSidebarCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const handleResizeStart = useCallback(
    (event) => {
      if (isCompact) return;
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);
    },
    [isCompact],
  );

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

  const handleNavigate = useCallback(
    (nextPath) => {
      onNavigate?.(nextPath);
      if (isCompact) setMobilePane('files');
    },
    [isCompact, onNavigate],
  );

  const handleOpenFile = useCallback(
    (entry) => {
      onOpenFile?.(entry);
      if (isCompact) setMobilePane('files');
    },
    [isCompact, onOpenFile],
  );

  const showFolders = isCompact ? mobilePane === 'folders' : !sidebarCollapsed;
  const showFiles = !isCompact || mobilePane === 'files';

  const explorerChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, {
      onNavigate: handleNavigate,
      compactMode: isCompact,
      onShowFolders: () => setMobilePane('folders'),
    });
  });

  return (
    <div className="nas-desktop-shell flex h-full flex-col bg-slate-100">
      <TopBar
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        onOpenSettings={onOpenSettings}
        settingsOpen={settingsOpen}
      />

      {isCompact ? (
        <div
          className="desktop-pane-tabs flex shrink-0 border-b border-nas-border bg-white px-2 py-1.5"
          role="tablist"
          aria-label="폴더와 파일 전환"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'folders'}
            className={`desktop-pane-tab ${mobilePane === 'folders' ? 'desktop-pane-tab--active' : ''}`}
            onClick={() => setMobilePane('folders')}
          >
            폴더
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'files'}
            className={`desktop-pane-tab ${mobilePane === 'files' ? 'desktop-pane-tab--active' : ''}`}
            onClick={() => setMobilePane('files')}
          >
            파일
          </button>
        </div>
      ) : null}

      <div
        ref={layoutRef}
        className={`flex min-h-0 flex-1 ${isCompact ? 'desktop-layout--compact' : ''}`}
      >
        <div
          className={`sidebar-panel relative flex min-h-0 min-w-0 shrink-0 flex-col ${
            showFolders ? '' : 'desktop-pane--hidden'
          }`}
          style={isCompact || sidebarCollapsed ? undefined : { ['--sidebar-width']: `${sidebarWidth}px` }}
          aria-hidden={!showFolders}
        >
          <Sidebar
            currentPath={currentPath}
            mainView={mainView}
            syncInfo={syncInfo}
            onNavigate={handleNavigate}
            onOpenFile={handleOpenFile}
          />
        </div>

        {!isCompact && !sidebarCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="사이드바 너비 조절"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={Math.max(SIDEBAR_MIN_WIDTH, Math.round(layoutWidth * SIDEBAR_MAX_RATIO))}
            aria-valuenow={sidebarWidth}
            className={`sidebar-resize-handle shrink-0 ${isResizing ? 'sidebar-resize-handle--active' : ''}`}
            onMouseDown={handleResizeStart}
          >
            <button
              type="button"
              className="sidebar-collapse-tab"
              title="폴더 패널 접기"
              aria-label="폴더 패널 접기"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setCollapsed(true)}
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>
        ) : null}

        {!isCompact && sidebarCollapsed ? (
          <div className="sidebar-collapsed-rail">
            <button
              type="button"
              className="sidebar-collapse-tab sidebar-collapse-tab--collapsed"
              title="폴더 패널 펼치기"
              aria-label="폴더 패널 펼치기"
              onClick={() => setCollapsed(false)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}

        <main
          className={`nas-desktop-main flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-4 ${
            showFiles ? '' : 'desktop-pane--hidden'
          }`}
          aria-hidden={!showFiles}
        >
          {explorerChildren}
        </main>
      </div>

      <StatusBar paths={paths} syncInfo={syncInfo} currentPath={currentPath} />
    </div>
  );
}
