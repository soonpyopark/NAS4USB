import Hls from 'hls.js';

/**
 * Attach hls.js to a video element so transcode playlists can grow without
 * killing Chromium's native MP4 demuxer.
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onReady?: () => void, onFatalError?: (data: unknown) => void }} [handlers]
 */
export function attachHlsPlayback(video, url, handlers = {}) {
  if (!Hls.isSupported()) {
    video.src = url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  const hls = new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    startPosition: 0,
    // EVENT playlists look "live" while FFmpeg appends. A finite
    // liveMaxLatencyDurationCount seeks forward to the transcode edge.
    liveSyncMode: 'buffered',
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: Number.POSITIVE_INFINITY,
    liveDurationInfinity: false,
    maxLiveSyncPlaybackRate: 1,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    backBufferLength: 120,
    progressive: true,
    manifestLoadingTimeOut: 120_000,
    levelLoadingTimeOut: 120_000,
    fragLoadingTimeOut: 120_000,
  });

  let destroyed = false;

  hls.attachMedia(video);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    if (!destroyed) hls.loadSource(url);
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    handlers.onReady?.();
    if (video.currentTime > 0.5) {
      // keep whatever position the user already reached
    } else {
      video.currentTime = 0;
    }
    void video.play().catch(() => {});
  });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (destroyed || !data?.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
      return;
    }
    handlers.onFatalError?.(data);
  });

  return () => {
    destroyed = true;
    hls.destroy();
  };
}
