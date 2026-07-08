import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesktopShell from './components/layout/DesktopShell.jsx';
import BrowserOnlyNotice from './components/layout/BrowserOnlyNotice.jsx';
import FileExplorer from './components/explorer/FileExplorer.jsx';
import HwpxEditorShell from './components/editors/HwpxEditorShell.jsx';
import Wb4sEditorShell from './components/editors/Wb4sEditorShell.jsx';
import XlsxEditorShell from './components/editors/XlsxEditorShell.jsx';
import TextEditorShell from './components/editors/TextEditorShell.jsx';
import BlockEditorShell from './components/editors/BlockEditorShell.jsx';
import AudioPlayerShell from './components/editors/AudioPlayerShell.jsx';
import VideoPlayerShell from './components/editors/VideoPlayerShell.jsx';
import { ShareLinkError, ShareLinkLoading } from './components/share/ShareLinkScreen.jsx';
import { AdminAuthProvider } from './context/AdminAuthContext.jsx';
import { FsSyncProvider, useFsSync } from './context/FsSyncContext.jsx';
import { useAppInfo } from './hooks/useAppInfo.js';
import { useFsChangeSync } from './hooks/useFsChangeSync.js';
import { hasNas4usbApi } from './lib/runtime.js';
import { guardOpenFileEntry } from './lib/openFileGuard.js';
import { useTrashGuardedNavigate } from './hooks/useTrashGuardedNavigate.js';
import { getShareTokenFromUrl } from './lib/shareAccess.js';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from './lib/media/mediaTypes.js';

const OPENABLE_EXTENSIONS = {
  hwpx: 'hwpx',
  wb4s: 'wb4s',
  xlsx: 'xlsx',
  xls: 'xlsx',
  txt: 'text',
  md: 'text',
  block: 'block',
  ...Object.fromEntries(AUDIO_EXTENSIONS.map((ext) => [ext, 'audio'])),
  ...Object.fromEntries(VIDEO_EXTENSIONS.map((ext) => [ext, 'video'])),
};

/**
 * @param {{
 *   openEditor: object | null,
 *   syncInfo: object,
 *   allowClose: boolean,
 *   fullscreen?: boolean,
 *   onClose: () => void,
 *   onRenamed: (entry?: { relativePath: string, name: string }) => void,
 * }} props
 */
function OpenEditorLayer({ openEditor, syncInfo, allowClose, fullscreen = false, onClose, onRenamed }) {
  if (!openEditor) return null;

  if (openEditor.type === 'hwpx') {
    return (
      <HwpxEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={syncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'wb4s') {
    return (
      <Wb4sEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={syncInfo}
        onClose={onClose}
        onRenamed={onRenamed}
        allowClose={allowClose}
      />
    );
  }

  if (openEditor.type === 'xlsx') {
    return (
      <XlsxEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={syncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'text') {
    return (
      <TextEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        extension={openEditor.extension ?? 'txt'}
        syncInfo={syncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
    );
  }

  if (openEditor.type === 'block') {
    return (
      <BlockEditorShell
        relativePath={openEditor.relativePath}
        fileName={openEditor.name}
        syncInfo={syncInfo}
        onClose={onClose}
        allowClose={allowClose}
        fullscreen={fullscreen}
      />
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
  const { currentPath, navigate } = useTrashGuardedNavigate('.');

  return (
    <>
      <DesktopShell
        paths={paths}
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        currentPath={currentPath}
        onNavigate={navigate}
        onHome={() => navigate('.')}
        onOpenFile={onOpenFile}
      >
        <FileExplorer
          currentPath={currentPath}
          onNavigate={navigate}
          onOpenFile={onOpenFile}
          syncInfo={syncInfo}
          isEditorOpen={Boolean(openEditor)}
        />
      </DesktopShell>

      <OpenEditorLayer
        openEditor={openEditor}
        syncInfo={syncInfo}
        allowClose
        onClose={onCloseEditor}
        onRenamed={onEditorRenamed}
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
      });
      return true;
    }

    if (isShareMode) {
      throw new Error('이 파일 형식은 공유 링크로 미리볼 수 없습니다.');
    }

    window.alert('이 파일 형식은 앱에서 편집할 수 없습니다.');
    return false;
  }, [isShareMode, notifyRemoteChange]);

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
    if (!shareToken || !window.nas4usb?.auth?.bindShareToken) return undefined;

    void window.nas4usb.auth.bindShareToken(shareToken);
    return () => {
      void window.nas4usb.auth.bindShareToken('');
    };
  }, [shareToken]);

  useEffect(() => {
    if (!shareToken || !window.nas4usb?.share?.resolve) return undefined;

    let cancelled = false;

    void (async () => {
      setShareStatus('loading');
      setShareError('');

      try {
        const entry = await window.nas4usb.share.resolve({ token: shareToken });
        if (cancelled) return;

        if (!entry?.relativePath) {
          setShareError('유효하지 않거나 만료된 공유 링크입니다.');
          setShareStatus('error');
          return;
        }

        await handleOpenFile(entry);
        if (cancelled) return;

        setShareStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setShareError(err instanceof Error ? err.message : '공유 링크를 열 수 없습니다.');
        setShareStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareToken, handleOpenFile]);

  useEffect(() => {
    if (isShareMode) return undefined;

    const onKeyDown = (event) => {
      if (
        event.key === 'Escape' &&
        openEditor &&
        openEditor.type !== 'wb4s'
      ) {
        setOpenEditor(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isShareMode, openEditor]);

  if (isShareMode) {
    if (shareStatus === 'loading') {
      return <ShareLinkLoading />;
    }

    if (shareStatus === 'error') {
      return <ShareLinkError message={shareError} />;
    }

    return (
      <OpenEditorLayer
        openEditor={openEditor}
        syncInfo={syncInfo}
        allowClose={false}
        fullscreen
        onClose={handleCloseEditor}
        onRenamed={handleEditorRenamed}
      />
    );
  }

  return (
    <AdminAuthProvider onAuthChange={() => notifyRemoteChange({})}>
      <Nas4usbDesktop
        paths={paths}
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        openEditor={openEditor}
        onOpenFile={handleOpenFile}
        onCloseEditor={handleCloseEditor}
        onEditorRenamed={handleEditorRenamed}
      />
    </AdminAuthProvider>
  );
}

function Nas4usbApp() {
  return (
    <FsSyncProvider>
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
