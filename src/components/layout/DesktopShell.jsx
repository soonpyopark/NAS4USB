import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import StatusBar from './StatusBar.jsx';
import { useFavorites } from '../../hooks/useFavorites.js';
import {
  FAVORITES_FILES_FOLDER,
  FAVORITES_FOLDERS_FOLDER,
  favoritesViewKind,
  isFavoritesPath,
} from '../../lib/favoritesPaths.js';

const SIDEBAR_DEFAULT_WIDTH = 288;
/** Do not allow shrinking below the initial startup width. */
const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;
const SIDEBAR_MAX_RATIO = 0.5;
/** Below this width: one pane at a time (folder | files). Wide tablets use two panes. */
const COMPACT_LAYOUT_MAX = 900;
const SIDEBAR_COLLAPSED_KEY = 'nas4usb.sidebarCollapsed';

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function FolderTreeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5.2l1.8 2H18.5A1.5 1.5 0 0 1 20 7.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2H14l5 5v13.5A1.5 1.5 0 0 1 17.5 22h-9A1.5 1.5 0 0 1 7 20.5Zm7 0v4h4" />
    </svg>
  );
}

function FavoriteFoldersIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h3.2l1.8 2h7A1.5 1.5 0 0 1 19 7.5V11h-2V8h-7.3L7.9 6H6v12h5v2H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M17.5 12l1.55 3.14 3.45.5-2.5 2.44.59 3.45-3.09-1.63-3.09 1.63.59-3.45-2.5-2.44 3.45-.5Z" />
    </svg>
  );
}

function FavoriteFilesIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.25l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 15.9l-5.04 2.88.96-5.62-4.08-3.98 5.64-.82L12 2.25z" />
    </svg>
  );
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
  onEntryRenamed,
}) {
  const layoutRef = useRef(null);
  const lastExplorerPathRef = useRef('.');
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobilePane, setMobilePane] = useState(/** @type {'folders' | 'files'} */ ('files'));
  const { folderFavoritesCount, fileFavoritesCount } = useFavorites();
  const favoritesView = favoritesViewKind(currentPath);
  const onFavorites = isFavoritesPath(currentPath);

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

  useEffect(() => {
    if (!isFavoritesPath(currentPath)) {
      lastExplorerPathRef.current = currentPath || '.';
    }
  }, [currentPath]);

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

  const openFilesPane = useCallback(() => {
    setMobilePane('files');
    if (isFavoritesPath(currentPath)) {
      onNavigate?.(lastExplorerPathRef.current || '.');
    }
  }, [currentPath, onNavigate]);

  const openFavoriteFolders = useCallback(() => {
    setMobilePane('files');
    onNavigate?.(FAVORITES_FOLDERS_FOLDER);
  }, [onNavigate]);

  const openFavoriteFiles = useCallback(() => {
    setMobilePane('files');
    onNavigate?.(FAVORITES_FILES_FOLDER);
  }, [onNavigate]);

  const showFolders = isCompact ? mobilePane === 'folders' : !sidebarCollapsed;
  const showFiles = !isCompact || mobilePane === 'files';
  const filesTabActive = mobilePane === 'files' && !onFavorites;
  const favoriteFoldersActive =
    mobilePane === 'files' && onFavorites && favoritesView === 'folders';
  const favoriteFilesActive =
    mobilePane === 'files' && onFavorites && (favoritesView === 'files' || favoritesView === 'all');

  const explorerChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, {
      onNavigate: handleNavigate,
      compactMode: isCompact,
      onShowFolders: () => setMobilePane('folders'),
      sidebarCollapsed,
      onToggleSidebar: isCompact ? undefined : () => setCollapsed(!sidebarCollapsed),
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
          aria-label="폴더·파일·즐겨찾기 전환"
        >
          <button
            type="button"
            role="tab"
            title="폴더"
            aria-label="폴더"
            aria-selected={mobilePane === 'folders'}
            className={`desktop-pane-tab desktop-pane-tab--icon ${
              mobilePane === 'folders' ? 'desktop-pane-tab--active' : ''
            }`}
            onClick={() => setMobilePane('folders')}
          >
            <FolderTreeIcon />
          </button>
          <button
            type="button"
            role="tab"
            title="파일"
            aria-label="파일"
            aria-selected={filesTabActive}
            className={`desktop-pane-tab desktop-pane-tab--icon ${
              filesTabActive ? 'desktop-pane-tab--active' : ''
            }`}
            onClick={openFilesPane}
          >
            <FilesIcon />
          </button>
          <button
            type="button"
            role="tab"
            title="폴더 즐겨찾기"
            aria-label={
              folderFavoritesCount > 0
                ? `폴더 즐겨찾기 ${folderFavoritesCount}개`
                : '폴더 즐겨찾기'
            }
            aria-selected={favoriteFoldersActive}
            className={`desktop-pane-tab desktop-pane-tab--icon ${
              favoriteFoldersActive ? 'desktop-pane-tab--active' : ''
            }`}
            onClick={openFavoriteFolders}
          >
            <FavoriteFoldersIcon />
            {folderFavoritesCount > 0 ? (
              <span className="desktop-pane-tab__badge">{folderFavoritesCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            title="파일 즐겨찾기"
            aria-label={
              fileFavoritesCount > 0 ? `파일 즐겨찾기 ${fileFavoritesCount}개` : '파일 즐겨찾기'
            }
            aria-selected={favoriteFilesActive}
            className={`desktop-pane-tab desktop-pane-tab--icon ${
              favoriteFilesActive ? 'desktop-pane-tab--active' : ''
            }`}
            onClick={openFavoriteFiles}
          >
            <FavoriteFilesIcon />
            {fileFavoritesCount > 0 ? (
              <span className="desktop-pane-tab__badge">{fileFavoritesCount}</span>
            ) : null}
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
            onEntryRenamed={onEntryRenamed}
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
          />
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
