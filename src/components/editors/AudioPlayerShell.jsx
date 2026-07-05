import ViewerModal from './ViewerModal.jsx';
import { useMediaObjectUrl } from '../../hooks/useMediaObjectUrl.js';
import { getAudioMimeType } from '../../lib/media/mediaTypes.js';

/**
 * @param {{ relativePath: string, fileName: string, extension: string, onClose: () => void }} props
 */
export default function AudioPlayerShell({ relativePath, fileName, extension, onClose, allowClose = true, fullscreen = false }) {
  const mimeType = getAudioMimeType(extension);
  const { workspace, objectUrl, loadError, loading } = useMediaObjectUrl(relativePath, mimeType);

  const handleClose = async () => {
    await workspace.close();
    onClose();
  };

  return (
    <ViewerModal
      title={fileName}
      subtitle={`음원 · ${extension.toUpperCase()} · ${mimeType}`}
      onClose={handleClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-slate-950 p-8">
        {loading && <p className="text-sm text-slate-300">음원 로드 중…</p>}

        {!loading && objectUrl && (
          <>
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-slate-800 text-slate-300">
              <svg className="h-16 w-16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
            <audio controls autoPlay className="w-full max-w-xl" src={objectUrl}>
              이 브라우저는 오디오 재생을 지원하지 않습니다.
            </audio>
          </>
        )}
      </div>
    </ViewerModal>
  );
}
