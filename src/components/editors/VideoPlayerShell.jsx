import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider, loadLocale } from '@videojs/react/i18n';
import { Video, VideoPlayer } from '@videojs/react/video';
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video';
import { AppModalButton } from '../common/AppModal.jsx';
import ViewerModal from './ViewerModal.jsx';
import Nas4usbClassicVideoSkin from './Nas4usbClassicVideoSkin.jsx';
import { useMediaStream } from '../../hooks/useMediaStream.js';
import { useVideoSeriesQueue } from '../../hooks/useVideoSeriesQueue.js';
import { isIosWebKit } from '../../lib/media/iosPlayback.js';
import { getVideoMimeType } from '../../lib/media/mediaTypes.js';
import { loadSiblingSubtitleTracks, shiftWebVttCues, vttToTrackUrl } from '../../lib/media/subtitles.js';
import {
  readShowingSubtitleLabel,
  refreshShowingSubtitles,
  replaceRemoteSubtitles,
} from '../../lib/media/videoJsSubtitles.js';
import {
  FFMPEG_HLS_JS_CONFIG,
  attemptMediaAutoplay,
  patchTimelineClockOnMedia,
} from '../../lib/media/videoJsPlayer.js';

const PLAY_NEXT_STORAGE_KEY = 'nas4usb.videoPlayer.playNextInSeries';

void loadLocale('ko').catch(() => {});

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
  raised = false,
  onOpenSibling,
}) {
  const mimeType = getVideoMimeType(extension);
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const mediaCleanupRef = useRef(/** @type {(() => void) | null} */ (null));
  const mutedForAutoplay = useRef(false);
  const durationRef = useRef(/** @type {number | null} */ (null));
  const startSecondsRef = useRef(0);
  const seekToRef = useRef(/** @type {(seconds: number) => unknown} */ (() => {}));
  const handleEndedRef = useRef(() => {});
  const subtitleChoiceRef = useRef(/** @type {string | null} */ (null));
  const ios = isIosWebKit();
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
  } = useMediaStream(relativePath, { preferFfmpegPreview: true, mediaRef: videoRef, mimeType });
  /** @type {[{ path: string, ext: string, label: string, vtt: string }[], Function]} */
  const [subtitleSources, setSubtitleSources] = useState([]);
  /** @type {[{ path: string, ext: string, label: string, src: string }[], Function]} */
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [subtitleNote, setSubtitleNote] = useState('');
  const [stalled, setStalled] = useState(false);
  const [playNextInSeries, setPlayNextInSeries] = useState(loadPlayNextPreference);
  const {
    prev: prevInSeries,
    next: nextInSeries,
    index: seriesIndex,
    total: seriesTotal,
  } = useVideoSeriesQueue(relativePath, fileName, extension, Boolean(onOpenSibling));
  const hasSeries = seriesTotal > 1;

  durationRef.current = durationSeconds;
  startSecondsRef.current = startSeconds;
  seekToRef.current = seekTo;

  const useHlsJs = playerKind === 'hls' && !ios;
  const mediaSrcType = playerKind === 'hls' ? 'application/vnd.apple.mpegurl' : mimeType;

  const togglePlayNext = useCallback((event) => {
    const enabled = event.target.checked;
    setPlayNextInSeries(enabled);
    try {
      localStorage.setItem(PLAY_NEXT_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const openSeriesEntry = useCallback(
    (entry) => {
      if (!entry || !onOpenSibling) return;
      void onOpenSibling(entry);
    },
    [onOpenSibling],
  );

  const handleEnded = useCallback(() => {
    if (isStreamingPreview) return;
    if (!playNextInSeries || !nextInSeries) return;
    openSeriesEntry(nextInSeries);
  }, [isStreamingPreview, nextInSeries, openSeriesEntry, playNextInSeries]);
  handleEndedRef.current = handleEnded;

  useEffect(() => {
    if (!hasSeries) return undefined;
    const onKeyDown = (event) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (event.key === 'ArrowLeft' && prevInSeries) {
        event.preventDefault();
        openSeriesEntry(prevInSeries);
      } else if (event.key === 'ArrowRight' && nextInSeries) {
        event.preventDefault();
        openSeriesEntry(nextInSeries);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSeries, nextInSeries, openSeriesEntry, prevInSeries]);

  useEffect(() => {
    let cancelled = false;
    setSubtitleSources([]);
    setSubtitleTracks([]);
    setSubtitleNote('');
    subtitleChoiceRef.current = null;

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
      window.setTimeout(() => {
        for (const url of urls) URL.revokeObjectURL(url);
      }, 1500);
    };
  }, [subtitleSources, startSeconds]);

  const attachMedia = useCallback(
    (/** @type {HTMLVideoElement} */ video) => {
      setStalled(false);
      mutedForAutoplay.current = false;
      const onWaiting = () => setStalled(true);
      const onPlaying = () => setStalled(false);
      const onEnded = () => handleEndedRef.current();
      const onSeeked = () => refreshShowingSubtitles(video);
      let trackChangeTimer = 0;
      const onTrackChange = () => {
        window.clearTimeout(trackChangeTimer);
        trackChangeTimer = window.setTimeout(() => {
          const label = readShowingSubtitleLabel(video);
          if (label != null) subtitleChoiceRef.current = label;
        }, 300);
      };
      const onReady = () => {
        setLoading(false);
        setPreparing(false);
        try {
          video.dispatchEvent(new Event('durationchange'));
        } catch {
          // ignore
        }
      };
      const onFatal = () => {
        setLoadError('호환 변환 영상을 재생할 수 없습니다.');
        setLoading(false);
        setPreparing(false);
      };
      const kickAutoplay = () => {
        attemptMediaAutoplay(video, hostRef.current, mutedForAutoplay);
      };

      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.addEventListener('loadedmetadata', mediaHandlers.onLoadedMetadata);
      video.addEventListener('canplay', mediaHandlers.onCanPlay);
      video.addEventListener('progress', mediaHandlers.onProgress);
      video.addEventListener('error', mediaHandlers.onError);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('ended', onEnded);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('loadedmetadata', kickAutoplay);
      video.addEventListener('canplay', kickAutoplay);
      video.textTracks?.addEventListener('change', onTrackChange);
      if (playerKind === 'hls') {
        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('error', onFatal);
      }

      const unpatch = patchTimelineClockOnMedia(
        video,
        { durationRef, startSecondsRef, seekToRef },
        { nativeSeek: ios },
      );

      return () => {
        unpatch();
        video.removeEventListener('loadedmetadata', mediaHandlers.onLoadedMetadata);
        video.removeEventListener('canplay', mediaHandlers.onCanPlay);
        video.removeEventListener('progress', mediaHandlers.onProgress);
        video.removeEventListener('error', mediaHandlers.onError);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('loadedmetadata', kickAutoplay);
        video.removeEventListener('canplay', kickAutoplay);
        video.textTracks?.removeEventListener('change', onTrackChange);
        if (playerKind === 'hls') {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('error', onFatal);
        }
        window.clearTimeout(trackChangeTimer);
      };
    },
    [ios, mediaHandlers, playerKind, setLoadError, setLoading, setPreparing],
  );

  const setMediaRef = useCallback(
    (/** @type {HTMLVideoElement | null} */ node) => {
      mediaCleanupRef.current?.();
      mediaCleanupRef.current = null;
      videoRef.current = node;
      if (node) {
        mediaCleanupRef.current = attachMedia(node);
      }
    },
    [attachMedia],
  );

  useEffect(
    () => () => {
      mediaCleanupRef.current?.();
      mediaCleanupRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.dispatchEvent(new Event('durationchange'));
    } catch {
      // ignore
    }
  }, [durationSeconds, startSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    replaceRemoteSubtitles(video, subtitleTracks, subtitleChoiceRef.current);
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
    <>
      <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[#323130]">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={playNextInSeries}
          onChange={togglePlayNext}
        />
        연속 재생
      </label>
      <AppModalButton
        disabled={!prevInSeries || loading}
        title={prevInSeries ? `이전 파일: ${prevInSeries.name} (Shift+←)` : '이전 파일 없음'}
        onClick={() => openSeriesEntry(prevInSeries)}
      >
        이전
      </AppModalButton>
      <AppModalButton
        disabled={!nextInSeries || loading}
        title={nextInSeries ? `다음 파일: ${nextInSeries.name} (Shift+→)` : '다음 파일 없음'}
        onClick={() => openSeriesEntry(nextInSeries)}
      >
        다음
      </AppModalButton>
    </>
  ) : null;

  const mediaProps = {
    ref: setMediaRef,
    src: streamUrl || undefined,
    playsInline: true,
    preload: 'auto',
    crossOrigin: ios ? undefined : 'anonymous',
    disablePictureInPicture: ios,
  };

  return (
    <ViewerModal
      title={fileName}
      titleSuffix={loading || isStreamingPreview || stalled ? '(변환하며 재생중...)' : ''}
      subtitle={statusBits.join(' · ')}
      actions={actions}
      onClose={onClose}
      allowClose={allowClose}
      fullscreen={fullscreen}
      raised={raised}
    >
      {loadError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col bg-black">
        <div
          ref={hostRef}
          className={`nas4usb-videojs-host min-h-0 flex-1${ios ? ' nas4usb-videojs-host--ios' : ''}`}
        >
          {streamUrl ? (
            <I18nProvider locale="ko">
              <VideoPlayer className="nas4usb-vjs10-player">
                <Nas4usbClassicVideoSkin className="nas4usb-vjs10-skin" ios={ios}>
                  {useHlsJs ? (
                    <HlsJsVideo {...mediaProps} engine={{ hlsJs: FFMPEG_HLS_JS_CONFIG }} />
                  ) : (
                    <Video {...mediaProps} type={mediaSrcType} />
                  )}
                </Nas4usbClassicVideoSkin>
              </VideoPlayer>
            </I18nProvider>
          ) : null}
        </div>
      </div>
    </ViewerModal>
  );
}
