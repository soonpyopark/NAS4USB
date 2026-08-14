import { useCallback, useEffect, useRef, useState } from 'react';
import 'video.js/dist/video-js.css';
import ViewerModal from './ViewerModal.jsx';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { useVideoSeriesQueue } from '../../hooks/useVideoSeriesQueue.js';
import { attachHlsPlayback } from '../../lib/media/hlsPlayer.js';
import { getVideoMimeType } from '../../lib/media/mediaTypes.js';
import { loadSiblingSubtitleTracks, shiftWebVttCues, vttToTrackUrl } from '../../lib/media/subtitles.js';
import { mountVideoJsPlayer } from '../../lib/media/videoJsPlayer.js';

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
  const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const playerRef = useRef(/** @type {import('video.js').VideoJsPlayer | null} */ (null));
  const durationRef = useRef(/** @type {number | null} */ (null));
  const startSecondsRef = useRef(0);
  const seekToRef = useRef(/** @type {(seconds: number) => unknown} */ (() => {}));
  const {
    streamUrl,
    loadError,
    loading,
    mediaHandlers,
    usingFfmpegPreview,
    isStreamingPreview,
    playerKind,
    setLoadError,
    setLoading,
    setPreparing,
    durationSeconds,
    startSeconds,
    seekTo,
  } = useMediaStream(relativePath, { preferFfmpegPreview: true, mediaRef: videoRef });
  /** @type {[{ path: string, ext: string, label: string, vtt: string }[], Function]} */
  const [subtitleSources, setSubtitleSources] = useState([]);
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

  durationRef.current = durationSeconds;
  startSecondsRef.current = startSeconds;
  seekToRef.current = seekTo;

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
    setSubtitleSources([]);
    setSubtitleTracks([]);
    setSubtitleNote('');

    (async () => {
      try {
        const tracks = await loadSiblingSubtitleTracks(relativePath);
        if (cancelled) return;
        setSubtitleSources(tracks);
        if (tracks.length > 0) {
          setSubtitleNote(tracks.map((track) => track.label || `.${track.ext}`).join(' · '));
        }
      } catch {
        if (!cancelled) setSubtitleNote('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relativePath]);

  useEffect(() => {
    /** @type {string[]} */
    const urls = [];
    const tracks = subtitleSources.map((track) => {
      const src = vttToTrackUrl(shiftWebVttCues(track.vtt, startSeconds));
      urls.push(src);
      return { path: track.path, ext: track.ext, label: track.label, src };
    });
    setSubtitleTracks(tracks);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [subtitleSources, startSeconds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !streamUrl) return undefined;

    const mounted = mountVideoJsPlayer(host, {
      durationRef,
      startSecondsRef,
      seekToRef,
    });
    videoRef.current = mounted.video;
    playerRef.current = mounted.player;
    setStalled(false);

    const video = mounted.video;
    const onWaiting = () => setStalled(true);
    const onPlaying = () => setStalled(false);
    video.addEventListener('loadedmetadata', mediaHandlers.onLoadedMetadata);
    video.addEventListener('canplay', mediaHandlers.onCanPlay);
    video.addEventListener('progress', mediaHandlers.onProgress);
    video.addEventListener('error', mediaHandlers.onError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', handleEnded);

    if (playerKind !== 'hls') {
      mounted.player.src({ src: streamUrl, type: mimeType });
    }

    const detachHls =
      playerKind === 'hls'
        ? attachHlsPlayback(video, streamUrl, {
            onReady: () => {
              setLoading(false);
              setPreparing(false);
              mounted.player.trigger('durationchange');
            },
            onFatalError: () => {
              setLoadError('호환 변환 영상을 재생할 수 없습니다.');
              setLoading(false);
              setPreparing(false);
            },
          })
        : undefined;

    return () => {
      detachHls?.();
      video.removeEventListener('loadedmetadata', mediaHandlers.onLoadedMetadata);
      video.removeEventListener('canplay', mediaHandlers.onCanPlay);
      video.removeEventListener('progress', mediaHandlers.onProgress);
      video.removeEventListener('error', mediaHandlers.onError);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', handleEnded);
      mounted.dispose();
      videoRef.current = null;
      playerRef.current = null;
    };
  }, [handleEnded, mimeType, playerKind, relativePath, streamUrl]);

  useEffect(() => {
    playerRef.current?.trigger('durationchange');
  }, [durationSeconds, startSeconds]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;

    const existing = player.remoteTextTracks();
    for (let i = existing.length - 1; i >= 0; i -= 1) {
      player.removeRemoteTextTrack(existing[i]);
    }
    subtitleTracks.forEach((track, index) => {
      player.addRemoteTextTrack(
        {
          kind: 'subtitles',
          src: track.src,
          srclang: 'ko',
          label: track.label,
          default: index === 0,
        },
        false,
      );
    });
    return undefined;
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
      titleSuffix={loading || isStreamingPreview || stalled ? '(변환하며 재생중...)' : ''}
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
        <div className="nas4usb-videojs-host min-h-0 flex-1">
          {streamUrl ? <div ref={hostRef} className="h-full w-full" /> : null}
        </div>
      </div>
    </ViewerModal>
  );
}
