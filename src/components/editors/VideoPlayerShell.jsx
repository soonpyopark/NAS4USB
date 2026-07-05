import ViewerModal from './ViewerModal.jsx';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { getVideoMimeType } from '../../lib/media/mediaTypes.js';

/**
 * @param {{ relativePath: string, fileName: string, extension: string, onClose: () => void }} props
 */
export default function VideoPlayerShell({ relativePath, fileName, extension, onClose, allowClose = true, fullscreen = false }) {
  const mimeType = getVideoMimeType(extension);
  const { streamUrl, loadError, loading, bufferedPercent, mediaHandlers } = useMediaStream(relativePath);

  return (
    <ViewerModal
      title={fileName}
      subtitle={`영상 · ${extension.toUpperCase()} · ${mimeType}`}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-4">
        {loading && (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-300">
            {bufferedPercent > 0 ? `버퍼링 중… ${bufferedPercent}%` : '영상 준비 중…'}
          </p>
        )}

        <video
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-md"
          src={streamUrl}
          {...mediaHandlers}
        >
          이 브라우저는 해당 영상 형식을 지원하지 않습니다.
        </video>
      </div>
    </ViewerModal>
  );
}
