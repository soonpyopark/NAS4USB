import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesktopShell from './components/layout/DesktopShell.jsx';
import BrowserOnlyNotice from './components/layout/BrowserOnlyNotice.jsx';
import FileExplorer from './components/explorer/FileExplorer.jsx';
import SettingsView from './components/settings/SettingsView.jsx';
import HwpxEditorShell from './components/editors/HwpxEditorShell.jsx';
import Wb4sEditorShell from './components/editors/Wb4sEditorShell.jsx';
import XlsxEditorShell from './components/editors/XlsxEditorShell.jsx';
import TextEditorShell from './components/editors/TextEditorShell.jsx';
import AudioPlayerShell from './components/editors/AudioPlayerShell.jsx';
import VideoPlayerShell from './components/editors/VideoPlayerShell.jsx';
import ImageViewerShell from './components/editors/ImageViewerShell.jsx';
import PdfViewerShell from './components/editors/PdfViewerShell.jsx';
import HtmlViewerShell from './components/editors/HtmlViewerShell.jsx';
import ComicReaderShell from './components/editors/ComicReaderShell.jsx';

const TipTapEditorShell = lazy(() => import('./components/editors/TipTapEditorShell.jsx'));
import { ShareLinkError, ShareLinkLoading } from './components/share/ShareLinkScreen.jsx';
import { AdminAuthProvider, useAdminAuthContext } from './context/AdminAuthContext.jsx';
import { LoginDialogProvider } from './context/LoginDialogContext.jsx';
import { FsSyncProvider, useFsSync } from './context/FsSyncContext.jsx';
import AppDialogHost from './components/common/AppDialogHost.jsx';
import { useAppInfo } from './hooks/useAppInfo.js';
import { useFsChangeSync } from './hooks/useFsChangeSync.js';
import { hasNas4usbApi } from './lib/runtime.js';
import { guardOpenFileEntry } from './lib/openFileGuard.js';
import { useTrashGuardedNavigate } from './hooks/useTrashGuardedNavigate.js';
import { SHARED_FOLDER } from '../shared/constants.js';
import { getShareTokenFromUrl } from './lib/shareAccess.js';
import { isShareViewOnly, resolveOpenShareMode } from './lib/shareLinkAccess.js';
import { resolveUnknownFileOpenAction } from './lib/unknownFileOpen.js';
import { syncInfoForPath } from './lib/externalFoldersUi.js';
import { nativeAlert } from './lib/nativeDialog.js';
import { shouldUseLegacyImagePdfViewers, setLegacyViewerSettingsFlag } from './lib/comicReader/legacyViewerFlag.js';
import {
  ARCHIVE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  EPUB_EXTENSIONS,
  HTML_EXTENSIONS,
  IMAGE_EXTENSIONS,
  isImageExtension,
  PDF_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './lib/media/mediaTypes.js';

/** Code / config files opened in the CodeMirror text editor (syntax highlight by ext). */
const CODE_TEXT_EXTENSIONS = [
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'json',
  'jsonc',
  'css',
  'scss',
  'less',
  'xml',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'hh',
  'cs',
  'php',
  'swift',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'yml',
  'yaml',
  'toml',
  'ini',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'mdx',
];

const OPENABLE_EXTENSIONS = {
  hwpx: 'hwpx',
  wb4s: 'wb4s',
  xlsx: 'xlsx',
  xls: 'xlsx',
  txt: 'text',
  md: 'text',
  tiptap: 'tiptap',
  ...Object.fromEntries(CODE_TEXT_EXTENSIONS.map((ext) => [ext, 'text'])),
  ...Object.fromEntries(AUDIO_EXTENSIONS.map((ext) => [ext, 'audio'])),
  ...Object.fromEntries(VIDEO_EXTENSIONS.map((ext) => [ext, 'video'])),
  ...Object.fromEntries(IMAGE_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(PDF_EXTENSIONS.map((ext) => [ext, 'pdf'])),
  ...Object.fromEntries(ARCHIVE_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(EPUB_EXTENSIONS.map((ext) => [ext, 'reader'])),
  ...Object.fromEntries(HTML_EXTENSIONS.map((ext) => [ext, 'html'])),
};

/**
 * @param {{
 *   openEditor: object | null,
 *   syncInfo: object,
 *   allowClose: boolean,
 *   fullscreen?: boolean,
 *   onClose: () => void,
 *   onRenamed: (entry?: { relativePath: string, name: string }) => void,
 *   onOpenFile?: (entry: object) => void | Promise<boolean>,
 * }} props
 */
function OpenEditorLayer({
  openEditor,
  syncInfo,
  allowClose,
  fullscreen = false,
  onClose,
  onRenamed,
  onOpenFile,
}) {
  if (!openEditor) return null;

  const shareMode = openEditor.shareMode ?? null;
  const shareViewOnly = isShareViewOnly(shareMode);
  const editorSyncInfo = syncInfoForPath(openEditor.relativePath, syncInfo);

  if (openEditor.type === 'hwpx') {
    return (
      <HwpxEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={editorSyncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
        shareMode={shareMode}
        readOnly={shareViewOnly}
      />
    );
  }

  if (openEditor.type === 'wb4s') {
    return (
      <Wb4sEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={editorSyncInfo}
        onClose={onClose}
        onRenamed={onRenamed}
        allowClose={allowClose}
        shareMode={shareMode}
        readOnly={shareViewOnly}
      />
    );
  }

  if (openEditor.type === 'xlsx') {
    return (
      <XlsxEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={editorSyncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
        shareMode={shareMode}
        readOnly={shareViewOnly}
      />
    );
  }

  if (openEditor.type === 'text') {
    return (
      <TextEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'txt'}
        syncInfo={editorSyncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
        shareMode={shareMode}
        readOnly={shareViewOnly}
      />
    );
  }

  if (openEditor.type === 'tiptap') {
    return (
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-nas-muted">TipTap 로딩 중…</div>}>
        <TipTapEditorShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          syncInfo={editorSyncInfo}
          onClose={onClose}
          allowClose={allowClose}
          fullscreen={fullscreen}
          shareMode={shareMode}
          readOnly={shareViewOnly}
        />
      </Suspense>
    );
  }

  if (openEditor.type === 'audio') {
    return (
      <AudioPlayerShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'mp3'}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'video') {
    return (
      <VideoPlayerShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'mp4'}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'reader') {
    const extension = openEditor.extension ?? 'png';
    if (shouldUseLegacyImagePdfViewers() && isImageExtension(extension)) {
      return (
        <ImageViewerShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          extension={extension}
          onClose={onClose}
          allowClose={allowClose}
          fullscreen={fullscreen}
          onOpenSibling={onOpenFile}
        />
      );
    }
    return (
      <ComicReaderShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={extension}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
        onOpenSibling={onOpenFile}
      />
    );
  }

  if (openEditor.type === 'pdf') {
    return (
      <PdfViewerShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'pdf'}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'html') {
    return (
      <HtmlViewerShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'html'}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  return null;
}

function Nas4usbDesktop({
  paths,
  syncInfo,
  infoLoading,
  openEditor,
  onOpenFile,
  onCloseEditor,
  onEditorRenamed,
}) {
  const { isSuperAdmin } = useAdminAuthContext();
  const { currentPath, navigate } = useTrashGuardedNavigate(SHARED_FOLDER);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (settingsOpen && !isSuperAdmin) {
      setSettingsOpen(false);
    }
  }, [isSuperAdmin, settingsOpen]);

  const handleNavigate = useCallback(
    (nextPath) => {
      navigate(nextPath);
    },
    [navigate],
  );

  const handleOpenSettings = useCallback(() => {
    if (!isSuperAdmin) {
      void nativeAlert('환경설정은 총괄관리자만 이용할 수 있습니다.');
      return;
    }
    setSettingsOpen((prev) => !prev);
  }, [isSuperAdmin]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  return (
    <>
      <DesktopShell
        paths={paths}
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        currentPath={currentPath}
        settingsOpen={settingsOpen}
        onNavigate={handleNavigate}
        onOpenSettings={handleOpenSettings}
        onOpenFile={onOpenFile}
      >
        <FileExplorer
          currentPath={currentPath}
          onNavigate={handleNavigate}
          onOpenFile={onOpenFile}
          syncInfo={syncInfo}
          isEditorOpen={Boolean(openEditor)}
        />
      </DesktopShell>

      {settingsOpen && isSuperAdmin ? <SettingsView onClose={handleCloseSettings} /> : null}

      <OpenEditorLayer
        openEditor={openEditor}
        syncInfo={syncInfo}
        allowClose
        onClose={onCloseEditor}
        onRenamed={onEditorRenamed}
        onOpenFile={onOpenFile}
      />
    </>
  );
}

function Nas4usbAppMain() {
  const shareToken = useMemo(() => getShareTokenFromUrl() || null, []);
  const isShareMode = Boolean(shareToken);

  const { paths, syncInfo, loading: infoLoading } = useAppInfo();
  const { notifyRemoteChange } = useFsSync();
  const [openEditor, setOpenEditor] = useState(null);
  const [shareStatus, setShareStatus] = useState(isShareMode ? 'loading' : 'idle');
  const [shareError, setShareError] = useState('');
  const openEditorRef = useRef(null);

  openEditorRef.current = openEditor;

  const handleRemoteFsChange = useCallback(
    (event) => {
      notifyRemoteChange(event);
    },
    [notifyRemoteChange],
  );

  useFsChangeSync(handleRemoteFsChange, { isEditorOpen: Boolean(openEditor) });

  useEffect(() => {
    let cancelled = false;
    async function loadLegacyFlag() {
      try {
        const settings = await window.nas4usb?.settings?.get?.();
        if (!cancelled) {
          setLegacyViewerSettingsFlag(Boolean(settings?.useLegacyImagePdfViewers));
        }
      } catch {
        // ignore
      }
    }
    loadLegacyFlag();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenFile = useCallback(async (entry) => {
    if (entry.isDirectory) {
      return false;
    }

    const canOpen = await guardOpenFileEntry(entry, {
      onMissing: () => notifyRemoteChange({ paths: [entry.relativePath] }),
    });
    if (!canOpen) return false;

    const viewerType = OPENABLE_EXTENSIONS[entry.extension];
    if (viewerType) {
      setOpenEditor({
        type: viewerType,
        relativePath: entry.relativePath,
        name: entry.name,
        extension: entry.extension,
        shareMode: resolveOpenShareMode(entry.mode),
      });
      return true;
    }

    const unknownAction = await resolveUnknownFileOpenAction(entry);
    if (unknownAction === 'text') {
      setOpenEditor({
        type: 'text',
        relativePath: entry.relativePath,
        name: entry.name,
        extension: entry.extension || 'txt',
        shareMode: resolveOpenShareMode(entry.mode),
      });
      return true;
    }

    return false;
  }, [notifyRemoteChange]);

  const handleCloseEditor = useCallback(() => {
    if (isShareMode) return;
    setOpenEditor(null);
  }, [isShareMode]);

  const handleEditorRenamed = useCallback((entry) => {
    if (entry?.relativePath && entry?.name) {
      setOpenEditor((prev) => {
        if (!prev) return prev;
        const extension = entry.name.includes('.')
          ? entry.name.split('.').pop()?.toLowerCase()
          : prev.extension;
        return {
          ...prev,
          relativePath: entry.relativePath,
          name: entry.name,
          extension: extension ?? prev.extension,
        };
      });
    }
    notifyRemoteChange(
      entry?.relativePath ? { paths: [entry.relativePath] } : {},
    );
  }, [notifyRemoteChange]);

  useEffect(() => {
    if (!shareToken || !window.nas4usb?.share?.resolve) return undefined;

    let cancelled = false;

    void (async () => {
      setShareStatus('loading');
      setShareError('');

      try {
        // 비공개·열람제한 파일도 fs.stat / workspace 편집 검사가 통과하도록 먼저 바인딩
        if (window.nas4usb?.auth?.bindShareToken) {
          await window.nas4usb.auth.bindShareToken(shareToken);
        }

        const entry = await window.nas4usb.share.resolve({ token: shareToken });
        if (cancelled) return;

        if (!entry?.relativePath) {
          setShareError('유효하지 않거나 만료된 공유 링크입니다.');
          setShareStatus('error');
          return;
        }

        const opened = await handleOpenFile(entry);
        if (cancelled) return;

        if (!opened) {
          setShareError('공유 파일을 열 수 없습니다.');
          setShareStatus('error');
          return;
        }

        setShareStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setShareError(err instanceof Error ? err.message : '공유 링크를 열 수 없습니다.');
        setShareStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      void window.nas4usb?.auth?.bindShareToken?.('');
    };
  }, [shareToken, handleOpenFile]);

  if (isShareMode) {
    if (shareStatus === 'loading') {
      return <ShareLinkLoading />;
    }

    if (shareStatus === 'error') {
      return <ShareLinkError message={shareError} />;
    }

    return (
      <div className="flex h-full min-h-full w-full flex-col bg-white">
        <OpenEditorLayer
          openEditor={openEditor}
          syncInfo={syncInfo}
          allowClose={false}
          fullscreen
          onClose={handleCloseEditor}
          onRenamed={handleEditorRenamed}
          onOpenFile={handleOpenFile}
        />
      </div>
    );
  }

  return (
    <AdminAuthProvider onAuthChange={() => notifyRemoteChange({})}>
      <LoginDialogProvider>
        <Nas4usbDesktop
          paths={paths}
          syncInfo={syncInfo}
          infoLoading={infoLoading}
          openEditor={openEditor}
          onOpenFile={handleOpenFile}
          onCloseEditor={handleCloseEditor}
          onEditorRenamed={handleEditorRenamed}
        />
      </LoginDialogProvider>
    </AdminAuthProvider>
  );
}

function Nas4usbApp() {
  return (
    <FsSyncProvider>
      <AppDialogHost />
      <Nas4usbAppMain />
    </FsSyncProvider>
  );
}

export default function App({ connectionError = null }) {
  if (!hasNas4usbApi()) {
    return <BrowserOnlyNotice error={connectionError} />;
  }

  return <Nas4usbApp />;
}
