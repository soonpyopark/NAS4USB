/**
 * hls.js options for FFmpeg progressive HLS previews (EVENT playlists).
 * Passed through Video.js 10 `HlsJsVideo` as `engine.hlsJs`.
 */
export const FFMPEG_HLS_JS_CONFIG = {
  enableWorker: false,
  lowLatencyMode: false,
  startPosition: 0,
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
};

/**
 * Patch media timeline so the control bar shows absolute file time while
 * FFmpeg preview plays a shifted segment. Mirrors the Video.js 8 player patch.
 *
 * @param {HTMLMediaElement} media
 * @param {{
 *   durationRef: { current: number | null },
 *   startSecondsRef: { current: number },
 *   seekToRef: { current: (seconds: number) => unknown },
 * }} clock
 * @param {{ nativeSeek?: boolean }} [options]
 * @returns {() => void} cleanup
 */
export function patchTimelineClockOnMedia(media, clock, options = {}) {
  const durationDesc = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'duration',
  );
  const currentTimeDesc = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'currentTime',
  );
  if (!durationDesc?.get || !currentTimeDesc?.get || !currentTimeDesc?.set) {
    return () => {};
  }

  let acceptSeeks = false;
  const acceptTimer = window.setTimeout(() => {
    acceptSeeks = true;
  }, 400);

  Object.defineProperty(media, 'duration', {
    configurable: true,
    enumerable: true,
    get() {
      const full = Number(clock.durationRef.current);
      if (Number.isFinite(full) && full > 0) return full;
      return durationDesc.get.call(this);
    },
  });

  Object.defineProperty(media, 'currentTime', {
    configurable: true,
    enumerable: true,
    get() {
      const origin =
        Number(clock.startSecondsRef.current) > 0.5
          ? Number(clock.startSecondsRef.current)
          : 0;
      return origin + (Number(currentTimeDesc.get.call(this)) || 0);
    },
    set(value) {
      const origin =
        Number(clock.startSecondsRef.current) > 0.5
          ? Number(clock.startSecondsRef.current)
          : 0;
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      const current = origin + (Number(currentTimeDesc.get.call(this)) || 0);
      if (!acceptSeeks || Math.abs(next - current) < 0.35) return;
      if (options.nativeSeek) {
        currentTimeDesc.set.call(this, Math.max(0, next - origin));
        return;
      }
      void clock.seekToRef.current?.(next);
    },
  });

  try {
    media.dispatchEvent(new Event('durationchange'));
  } catch {
    // ignore
  }

  return () => {
    window.clearTimeout(acceptTimer);
    try {
      delete media.duration;
    } catch {
      // ignore
    }
    try {
      delete media.currentTime;
    } catch {
      // ignore
    }
  };
}
