import { useCallback, useEffect, useMemo, useState } from 'react';
import DesktopShell from './components/layout/DesktopShell.jsx';
import BrowserOnlyNotice from './components/layout/BrowserOnlyNotice.jsx';
import FileExplorer from './components/explorer/FileExplorer.jsx';
import HwpxEditorShell from './components/editors/HwpxEditorShell.jsx';
import Wb4sEditorShell from './components/editors/Wb4sEditorShell.jsx';
import XlsxEditorShell from './components/editors/XlsxEditorShell.jsx';
import TextEditorShell from './components/editors/TextEditorShell.jsx';
import AudioPlayerShell from './components/editors/AudioPlayerShell.jsx';
import VideoPlayerShell from './components/editors/VideoPlayerShell.jsx';
import { ShareLinkError, ShareLinkLoading } from './components/share/ShareLinkScreen.jsx';
import { useAppInfo } from './hooks/useAppInfo.js';
import { hasEducoworkApi } from './lib/runtime.js';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from './lib/media/mediaTypes.js';

const OPENABLE_EXTENSIONS = {
  hwpx: 'hwpx',
  wb4s: 'wb4s',
  xlsx: 'xlsx',
  xls: 'xlsx',
  txt: 'text',
  md: 'text',
  ...Object.fromEntries(AUDIO_EXTENSIONS.map((ext) => [ext, 'audio'])),
  ...Object.fromEntries(VIDEO_EXTENSIONS.map((ext) => [ext, 'video'])),
};

function getShareTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('share')?.trim() || null;
}

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

function EduCoworkApp() {
  const shareToken = useMemo(() => getShareTokenFromUrl(), []);
  const isShareMode = Boolean(shareToken);

  const { paths, syncInfo, loading: infoLoading } = useAppInfo();
  const [currentPath, setCurrentPath] = useState('.');
  const [openEditor, setOpenEditor] = useState(null);
  const [fsRevision, setFsRevision] = useState(0);
  const [shareStatus, setShareStatus] = useState(isShareMode ? 'loading' : 'idle');
  const [shareError, setShareError] = useState('');

  const handleOpenFile = useCallback(async (entry, { fromShare = false } = {}) => {
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

    if (fromShare) {
      throw new Error('이 파일 형식은 공유 링크로 미리볼 수 없습니다.');
    }

    try {
      await window.educowork.fs.openPath(entry.relativePath);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일을 열 수 없습니다.');
    }

    return false;
  }, []);

  const handleCloseEditor = useCallback(() => {
    if (isShareMode) return;
    setOpenEditor(null);
  }, [isShareMode]);

  const handleHome = useCallback(() => {
    setCurrentPath('.');
  }, []);

  const handleFsChanged = useCallback(() => {
    setFsRevision((value) => value + 1);
  }, []);

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
    handleFsChanged();
  }, [handleFsChanged]);

  useEffect(() => {
    if (!shareToken || !window.educowork?.share?.resolve) return undefined;

    let cancelled = false;

    void (async () => {
      setShareStatus('loading');
      setShareError('');

      try {
        const entry = await window.educowork.share.resolve({ token: shareToken });
        if (cancelled) return;

        if (!entry?.relativePath) {
          setShareError('유효하지 않거나 만료된 공유 링크입니다.');
          setShareStatus('error');
          return;
        }

        await handleOpenFile(entry, { fromShare: true });
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
      if (event.key === 'Escape' && openEditor && openEditor.type !== 'wb4s') {
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
    <>
      <DesktopShell
        paths={paths}
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        currentPath={currentPath}
        fsRevision={fsRevision}
        onNavigate={setCurrentPath}
        onHome={handleHome}
        onOpenFile={handleOpenFile}
        onFsChanged={handleFsChanged}
      >
        <FileExplorer
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          onOpenFile={handleOpenFile}
          onFsChanged={handleFsChanged}
          fsRevision={fsRevision}
          syncInfo={syncInfo}
        />
      </DesktopShell>

      <OpenEditorLayer
        openEditor={openEditor}
        syncInfo={syncInfo}
        allowClose
        onClose={handleCloseEditor}
        onRenamed={handleEditorRenamed}
      />
    </>
  );
}

export default function App({ connectionError = null }) {
  if (!hasEducoworkApi()) {
    return <BrowserOnlyNotice error={connectionError} />;
  }

  return <EduCoworkApp />;
}
