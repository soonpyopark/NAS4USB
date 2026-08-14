import videojs from 'video.js';
import ko from 'video.js/dist/lang/ko.json';

videojs.addLanguage('ko', ko);

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {{
 *   durationRef: { current: number | null },
 *   startSecondsRef: { current: number },
 *   seekToRef: { current: (seconds: number) => unknown },
 * }} clock
 */
function patchTimelineClock(player, clock) {
  const readDuration = player.duration.bind(player);
  const readCurrentTime = player.currentTime.bind(player);

  player.duration = (value) => {
    if (typeof value !== 'undefined') return readDuration(value);
    const full = Number(clock.durationRef.current);
    if (Number.isFinite(full) && full > 0) return full;
    return readDuration();
  };

  let acceptSeeks = false;
  player.ready(() => {
    window.setTimeout(() => {
      acceptSeeks = true;
    }, 400);
  });

  player.currentTime = (value) => {
    const origin = Number(clock.startSecondsRef.current) > 0.5 ? Number(clock.startSecondsRef.current) : 0;
    if (typeof value === 'undefined') {
      return origin + (Number(readCurrentTime()) || 0);
    }
    const next = Number(value);
    if (!Number.isFinite(next)) return readCurrentTime();
    const current = origin + (Number(readCurrentTime()) || 0);
    if (!acceptSeeks || Math.abs(next - current) < 0.35) return next;
    void clock.seekToRef.current?.(next);
    return next;
  };
}

/**
 * Mount Video.js on a host element. HLS/native src attach to the inner video.
 *
 * @param {HTMLElement} host
 * @param {{
 *   durationRef: { current: number | null },
 *   startSecondsRef: { current: number },
 *   seekToRef: { current: (seconds: number) => unknown },
 * }} clock
 */
export function mountVideoJsPlayer(host, clock) {
  const video = document.createElement('video');
  video.className = 'video-js vjs-big-play-centered vjs-fill';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  host.replaceChildren(video);

  const player = videojs(video, {
    controls: true,
    autoplay: true,
    preload: 'auto',
    fill: true,
    responsive: true,
    language: 'ko',
    restoreEl: true,
    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    inactivityTimeout: 2500,
    liveui: true,
    liveTracker: {
      trackingThreshold: 0,
      liveTolerance: 15,
    },
    enableSmoothSeeking: true,
    disablePictureInPicture: false,
    skipButtons: {
      backward: 10,
      forward: 10,
    },
    spatialNavigation: {
      enabled: true,
      horizontalSeek: true,
    },
    userActions: {
      click: true,
      doubleClick: true,
      hotkeys: true,
    },
    html5: {
      vhs: { overrideNative: true },
      nativeAudioTracks: true,
      nativeVideoTracks: true,
      nativeTextTracks: true,
    },
    controlBar: {
      playToggle: true,
      skipBackward: true,
      skipForward: true,
      volumePanel: { inline: false },
      currentTimeDisplay: true,
      timeDivider: true,
      durationDisplay: true,
      progressControl: true,
      liveDisplay: true,
      seekToLive: true,
      remainingTimeDisplay: true,
      playbackRateMenuButton: true,
      chaptersButton: true,
      descriptionsButton: true,
      subsCapsButton: true,
      audioTrackButton: true,
      pictureInPictureToggle: true,
      fullscreenToggle: true,
    },
  });

  patchTimelineClock(player, clock);
  player.ready(() => {
    player.trigger('durationchange');
  });

  return {
    player,
    video,
    dispose: () => {
      try {
        player.dispose();
      } catch {
        // already disposed
      }
      host.replaceChildren();
    },
  };
}
