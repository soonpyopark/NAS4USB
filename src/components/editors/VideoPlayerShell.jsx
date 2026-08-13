import { useCallback, useEffect, useRef, useState } from 'react';
import ViewerModal from './ViewerModal.jsx';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { useVideoSeriesQueue } from '../../hooks/useVideoSeriesQueue.js';
import { attachHlsPlayback } from '../../lib/media/hlsPlayer.js';
import { getVideoMimeType } from '../../lib/media/mediaTypes.js';
import { loadSiblingSubtitleTracks } from '../../lib/media/subtitles.js';

const PLAY_NEXT_STORAGE_KEY = 'nas4usb.videoPlayer.playNextInSeries';

function loadPlayNextPreference() {
  try {
    return localStorage.getItem(PLAY_NEXT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   extension: string,
 *   onClose: () => void,
 *   allowClose?: boolean,
 *   fullscreen?: boolean,
 *   onOpenSibling?: (entry: import('../../types/nas4usb.d.ts').FsEntry) => void | Promise<boolean>,
 * }} props
 */
export default function VideoPlayerShell({
  relativePath,
  fileName,
  extension,
  onClose,
  allowClose = true,
  fullscreen = false,
  onOpenSibling,
}) {
  const mimeType = getVideoMimeType(extension);
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const {
    streamUrl,
    loadError,
    loading,
    bufferedPercent,
    mediaHandlers,
    previewNote,
    usingFfmpegPreview,
    isStreamingPreview,
    playerKind,
    setLoadError,
    setLoading,
    setPreparing,
  } = useMediaStream(relativePath, { preferFfmpegPreview: true, mediaRef: videoRef });
  /** @type {[{ path: string, ext: string, label: string, src: string }[], Function]} */
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [subtitleNote, setSubtitleNote] = useState('');
  const [stalled, setStalled] = useState(false);
  const [playNextInSeries, setPlayNextInSeries] = useState(loadPlayNextPreference);
  const { next: nextInSeries, index: seriesIndex, total: seriesTotal } = useVideoSeriesQueue(
    relativePath,
    fileName,
    extension,
    Boolean(onOpenSibling),
  );
  const hasSeries = seriesTotal > 1;

  const togglePlayNext = useCallback((event) => {
    const enabled = event.target.checked;
    setPlayNextInSeries(enabled);
    try {
      localStorage.setItem(PLAY_NEXT_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const handleEnded = useCallback(() => {
    if (isStreamingPreview) return;
    if (!playNextInSeries || !nextInSeries || !onOpenSibling) return;
    void onOpenSibling(nextInSeries);
  }, [isStreamingPreview, nextInSeries, onOpenSibling, playNextInSeries]);

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
    if (!video || playerKind !== 'hls' || !streamUrl) return undefined;
    setStalled(false);
    return attachHlsPlayback(video, streamUrl, {
      onReady: () => {
        setLoading(false);
        setPreparing(false);
      },
      onFatalError: () => {
        setLoadError('호환 변환 영상을 재생할 수 없습니다.');
        setLoading(false);
        setPreparing(false);
      },
    });
    // setters from useState are stable
  }, [playerKind, relativePath, streamUrl]);

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
    hasSeries && seriesIndex >= 0 ? `${seriesIndex + 1}/${seriesTotal}` : '',
    playNextInSeries && nextInSeries ? `다음 ${nextInSeries.name}` : '',
  ].filter(Boolean);

  const actions = hasSeries ? (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[#323130]">
      <input
        type="checkbox"
        className="rounded border-slate-300"
        checked={playNextInSeries}
        onChange={togglePlayNext}
      />
      연속 재생
    </label>
  ) : null;

  return (
    <ViewerModal
      title={fileName}
      subtitle={statusBits.join(' · ')}
      actions={actions}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col bg-black">
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {streamUrl ? (
            <video
              key={playerKind === 'hls' ? `hls:${relativePath}` : streamUrl}
              ref={videoRef}
              controls
              autoPlay
              playsInline
              crossOrigin="anonymous"
              className="max-h-full max-w-full rounded-md"
              src={playerKind === 'hls' ? undefined : streamUrl}
              {...mediaHandlers}
              onWaiting={() => setStalled(true)}
              onPlaying={() => setStalled(false)}
              onEnded={handleEnded}
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
        {loading || isStreamingPreview || stalled ? (
          <p className="shrink-0 border-t border-slate-800 px-4 py-2 text-center text-sm text-slate-300">
            {loading
              ? usingFfmpegPreview || previewNote
                ? bufferedPercent > 0
                  ? `호환 변환 버퍼링 중… ${bufferedPercent}%`
                  : '변환하며 재생 준비 중…'
                : bufferedPercent > 0
                  ? `버퍼링 중… ${bufferedPercent}%`
                  : '영상 준비 중…'
              : stalled && isStreamingPreview
                ? '변환 속도를 따라잡는 중…'
                : '변환하며 재생 중…'}
          </p>
        ) : null}
      </div>
    </ViewerModal>
  );
}
