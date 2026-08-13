import { useEffect, useRef, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { getVideoMimeType } from '../../lib/media/mediaTypes.js';
import { loadSiblingSubtitleTracks } from '../../lib/media/subtitles.js';

/**
 * @param {{ relativePath: string, fileName: string, extension: string, onClose: () => void, allowClose?: boolean, fullscreen?: boolean }} props
 */
export default function VideoPlayerShell({
  relativePath,
  fileName,
  extension,
  onClose,
  allowClose = true,
  fullscreen = false,
}) {
  const mimeType = getVideoMimeType(extension);
  const {
    streamUrl,
    loadError,
    loading,
    bufferedPercent,
    mediaHandlers,
    previewNote,
    usingFfmpegPreview,
  } = useMediaStream(relativePath, { preferFfmpegPreview: true });
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null));
  /** @type {[{ path: string, ext: string, label: string, src: string }[], Function]} */
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [subtitleNote, setSubtitleNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    /** @type {string[]} */
    const blobUrls = [];

    setSubtitleTracks([]);
    setSubtitleNote('');

    (async () => {
      try {
        const tracks = await loadSiblingSubtitleTracks(relativePath);
        if (cancelled) {
          for (const track of tracks) URL.revokeObjectURL(track.src);
          return;
        }
        blobUrls.push(...tracks.map((track) => track.src));
        setSubtitleTracks(tracks);
        if (tracks.length > 0) {
          setSubtitleNote(tracks.map((track) => `.${track.ext}`).join(' · '));
        }
      } catch {
        if (!cancelled) setSubtitleNote('');
      }
    })();

    return () => {
      cancelled = true;
      for (const url of blobUrls) URL.revokeObjectURL(url);
    };
  }, [relativePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || subtitleTracks.length === 0) return undefined;

    const showTracks = () => {
      const list = video.textTracks;
      for (let i = 0; i < list.length; i += 1) {
        list[i].mode = i === 0 ? 'showing' : 'hidden';
      }
    };

    showTracks();
    video.addEventListener('loadedmetadata', showTracks);
    return () => video.removeEventListener('loadedmetadata', showTracks);
  }, [subtitleTracks, streamUrl]);

  const statusBits = [
    `영상 · ${extension.toUpperCase()} · ${mimeType}`,
    subtitleNote ? `자막 ${subtitleNote}` : '',
    usingFfmpegPreview ? 'FFmpeg 호환' : '',
  ].filter(Boolean);

  return (
    <ViewerModal
      title={fileName}
      subtitle={statusBits.join(' · ')}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-4">
        {loading && (
          <p className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm text-slate-300">
            {usingFfmpegPreview || previewNote
              ? bufferedPercent > 0
                ? `호환 변환 버퍼링 중… ${bufferedPercent}%`
                : '호환 재생 준비 중… (최초 변환은 파일 크기에 따라 시간이 걸릴 수 있습니다)'
              : bufferedPercent > 0
                ? `버퍼링 중… ${bufferedPercent}%`
                : '영상 준비 중…'}
          </p>
        )}

        {streamUrl ? (
          <video
            key={streamUrl}
            ref={videoRef}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
            className="max-h-full max-w-full rounded-md"
            src={streamUrl}
            {...mediaHandlers}
          >
            {subtitleTracks.map((track, index) => (
              <track
                key={`${track.path}-${track.src}`}
                kind="subtitles"
                srcLang="ko"
                label={track.label}
                src={track.src}
                default={index === 0}
              />
            ))}
            이 브라우저는 해당 영상 형식을 지원하지 않습니다.
          </video>
        ) : null}
      </div>
    </ViewerModal>
  );
}
