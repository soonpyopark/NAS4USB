import Hls from 'hls.js';
import { isIosWebKit } from './iosPlayback.js';

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onReady?: () => void, onFatalError?: (data: unknown) => void }} [handlers]
 */
function attachNativeHls(video, url, handlers = {}) {
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.src = url;
  video.load();

  const onReady = () => handlers.onReady?.();
  const onError = () => handlers.onFatalError?.(video.error);
  video.addEventListener('loadedmetadata', onReady);
  video.addEventListener('error', onError);
  void video.play().catch(() => {});

  return () => {
    video.removeEventListener('loadedmetadata', onReady);
    video.removeEventListener('error', onError);
    video.removeAttribute('src');
    video.load();
  };
}

/**
 * Attach hls.js to a video element so transcode playlists can grow without
 * killing Chromium's native MP4 demuxer. iOS WebKit has no usable MSE, so
 * that path always uses native HLS.
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onReady?: () => void, onFatalError?: (data: unknown) => void }} [handlers]
 */
export function attachHlsPlayback(video, url, handlers = {}) {
  if (isIosWebKit() || !Hls.isSupported()) {
    return attachNativeHls(video, url, handlers);
  }

  const hls = new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    startPosition: 0,
    // EVENT playlists look "live" while FFmpeg appends. Never snap to the
    // transcode edge or back to 0 — the timeline is treated as VOD.
    liveSyncMode: 'buffered',
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: Number.POSITIVE_INFINITY,
    liveDurationInfinity: false,
    maxLiveSyncPlaybackRate: 1,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    backBufferLength: 120,
    progressive: true,
    manifestLoadingTimeOut: 30_000,
    manifestLoadingMaxRetry: 40,
    manifestLoadingRetryDelay: 400,
    levelLoadingTimeOut: 30_000,
    levelLoadingMaxRetry: 20,
    fragLoadingTimeOut: 90_000,
  });

  let destroyed = false;
  let resumeAt = 0;

  const rememberPosition = () => {
    if (Number.isFinite(video.currentTime) && video.currentTime > 0.25) {
      resumeAt = video.currentTime;
    }
  };

  const restorePosition = () => {
    if (resumeAt > 0.25 && Math.abs((Number(video.currentTime) || 0) - resumeAt) > 0.5) {
      try {
        video.currentTime = resumeAt;
      } catch {
        // ignore
      }
    }
  };

  video.addEventListener('timeupdate', rememberPosition);
  video.addEventListener('seeking', rememberPosition);
  video.addEventListener('seeked', rememberPosition);

  hls.attachMedia(video);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    if (!destroyed) hls.loadSource(url);
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    handlers.onReady?.();
    restorePosition();
    void video.play().catch(() => {});
  });
  hls.on(Hls.Events.LEVEL_UPDATED, restorePosition);
  hls.on(Hls.Events.BUFFER_FLUSHED, () => {
    window.setTimeout(restorePosition, 0);
  });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (destroyed || !data?.fatal) return;
    rememberPosition();
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
      window.setTimeout(restorePosition, 80);
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
      window.setTimeout(restorePosition, 80);
      return;
    }
    handlers.onFatalError?.(data);
  });

  return () => {
    destroyed = true;
    video.removeEventListener('timeupdate', rememberPosition);
    video.removeEventListener('seeking', rememberPosition);
    video.removeEventListener('seeked', rememberPosition);
    hls.destroy();
  };
}
