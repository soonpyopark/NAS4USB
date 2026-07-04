import { useCallback, useEffect, useState } from 'react';
import DesktopShell from './components/layout/DesktopShell.jsx';
import BrowserOnlyNotice from './components/layout/BrowserOnlyNotice.jsx';
import FileExplorer from './components/explorer/FileExplorer.jsx';
import HwpxEditorShell from './components/editors/HwpxEditorShell.jsx';
import Wb4sEditorShell from './components/editors/Wb4sEditorShell.jsx';
import XlsxEditorShell from './components/editors/XlsxEditorShell.jsx';
import TextEditorShell from './components/editors/TextEditorShell.jsx';
import AudioPlayerShell from './components/editors/AudioPlayerShell.jsx';
import VideoPlayerShell from './components/editors/VideoPlayerShell.jsx';
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

function EduCoworkApp() {
  const { paths, syncInfo, loading: infoLoading } = useAppInfo();
  const [currentPath, setCurrentPath] = useState('.');
  const [openEditor, setOpenEditor] = useState(null);
  const [fsRevision, setFsRevision] = useState(0);

  const handleOpenFile = useCallback(async (entry) => {
    const viewerType = OPENABLE_EXTENSIONS[entry.extension];
    if (viewerType) {
      setOpenEditor({
        type: viewerType,
        relativePath: entry.relativePath,
        name: entry.name,
        extension: entry.extension,
      });
      return;
    }

    try {
      await window.educowork.fs.openPath(entry.relativePath);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일을 열 수 없습니다.');
    }
  }, []);

  const handleCloseEditor = useCallback(() => {
    setOpenEditor(null);
  }, []);

  const handleHome = useCallback(() => {
    setCurrentPath('.');
  }, []);

  const handleFsChanged = useCallback(() => {
    setFsRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && openEditor && openEditor.type !== 'wb4s') {
        setOpenEditor(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openEditor]);

  return (
    <>
      <DesktopShell
        paths={paths}
        syncInfo={syncInfo}
        infoLoading={infoLoading}
        currentPath={currentPath}
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
        />
      </DesktopShell>

      {openEditor?.type === 'hwpx' && (
        <HwpxEditorShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          syncInfo={syncInfo}
          onClose={handleCloseEditor}
        />
      )}

      {openEditor?.type === 'wb4s' && (
        <Wb4sEditorShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          syncInfo={syncInfo}
          onClose={handleCloseEditor}
          onRenamed={handleFsChanged}
        />
      )}

      {openEditor?.type === 'xlsx' && (
        <XlsxEditorShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          syncInfo={syncInfo}
          onClose={handleCloseEditor}
        />
      )}

      {openEditor?.type === 'text' && (
        <TextEditorShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          extension={openEditor.extension ?? 'txt'}
          syncInfo={syncInfo}
          onClose={handleCloseEditor}
        />
      )}

      {openEditor?.type === 'audio' && (
        <AudioPlayerShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          extension={openEditor.extension ?? 'mp3'}
          onClose={handleCloseEditor}
        />
      )}

      {openEditor?.type === 'video' && (
        <VideoPlayerShell
          relativePath={openEditor.relativePath}
          fileName={openEditor.name}
          extension={openEditor.extension ?? 'mp4'}
          onClose={handleCloseEditor}
        />
      )}
    </>
  );
}

export default function App({ connectionError = null }) {
  if (!hasEducoworkApi()) {
    return <BrowserOnlyNotice error={connectionError} />;
  }

  return <EduCoworkApp />;
}
