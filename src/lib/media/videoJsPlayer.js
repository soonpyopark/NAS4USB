/**
 * Video.js 10 helpers: HLS config for FFmpeg previews + timeline clock patch.
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

export const CLICK_ZONE_SPLIT = 1 / 3;
export const CLICK_DELAY_MS = 280;
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_PX = 48;
export const UI_CHROME_SELECTOR =
  '.nas4usb-classic-bar, .nas4usb-classic-menu, .nas4usb-classic-big-play, [data-nas4usb-chrome="1"]';

/**
 * Patch media timeline so the control bar shows absolute file time while
 * FFmpeg preview plays a shifted segment.
 *
 * @param {HTMLMediaElement} media
 * @param {{
 *   durationRef: { current: number | null },
 *   startSecondsRef: { current: number },
 *   seekToRef: { current: (seconds: number) => unknown },
 * }} clock
 * @param {{ nativeSeek?: boolean }} [options]
 * @returns {() => void}
 */
export function patchTimelineClockOnMedia(media, clock, options = {}) {
  const durationDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
  const currentTimeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
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
        Number(clock.startSecondsRef.current) > 0.5 ? Number(clock.startSecondsRef.current) : 0;
      return origin + (Number(currentTimeDesc.get.call(this)) || 0);
    },
    set(value) {
      const origin =
        Number(clock.startSecondsRef.current) > 0.5 ? Number(clock.startSecondsRef.current) : 0;
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

/**
 * iOS Safari blocks unmuted autoplay without a fresh user gesture.
 * Try normal play first; if rejected, start muted and unmute on the next tap.
 *
 * @param {HTMLMediaElement} media
 * @param {HTMLElement | null} surfaceEl
 * @param {{ current: boolean }} mutedForAutoplay
 */
export function attemptMediaAutoplay(media, surfaceEl, mutedForAutoplay) {
  if (!media || !media.paused) return;
  const playPromise = media.play();
  if (!playPromise || typeof playPromise.then !== 'function') return;
  void playPromise.catch(() => {
    media.muted = true;
    mutedForAutoplay.current = true;
    void media.play()?.catch?.(() => {});
    if (!surfaceEl) return;
    const unmuteOnGesture = () => {
      if (!mutedForAutoplay.current) return;
      mutedForAutoplay.current = false;
      media.muted = false;
    };
    surfaceEl.addEventListener('pointerdown', unmuteOnGesture, { once: true });
  });
}
