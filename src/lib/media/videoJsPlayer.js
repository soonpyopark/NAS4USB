import videojs from 'video.js';
import ko from 'video.js/dist/lang/ko.json';
import { isIosWebKit } from './iosPlayback.js';

videojs.addLanguage('ko', ko);

const SkipBackward = videojs.getComponent('SkipBackward');
const SkipForward = videojs.getComponent('SkipForward');

class SkipBackward5 extends SkipBackward {
  getSkipBackwardTime() {
    return 5;
  }
}

class SkipForward5 extends SkipForward {
  getSkipForwardTime() {
    return 5;
  }
}

videojs.registerComponent('SkipBackward5', SkipBackward5);
videojs.registerComponent('SkipForward5', SkipForward5);

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {{
 *   durationRef: { current: number | null },
 *   startSecondsRef: { current: number },
 *   seekToRef: { current: (seconds: number) => unknown },
 * }} clock
 */
function patchTimelineClock(player, clock, options = {}) {
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
    if (options.nativeSeek) {
      return readCurrentTime(Math.max(0, next - origin));
    }
    void clock.seekToRef.current?.(next);
    return next;
  };
}

const CLICK_ZONE_SPLIT = 1 / 3;
const CLICK_DELAY_MS = 280;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 48;
const UI_CHROME_SELECTOR =
  '.vjs-control-bar, .vjs-modal-dialog, .vjs-menu, .vjs-big-play-button, .vjs-text-track-settings';

/**
 * @param {Event} event
 * @returns {{ x: number, y: number } | null}
 */
function clientPoint(event) {
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches?.[0];
  if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {number} x
 * @param {number} y
 * @returns {'left' | 'center' | 'right'}
 */
function clickZone(player, x, y) {
  const el = player.el();
  if (!el || !Number.isFinite(x)) return 'center';
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return 'center';
  const ratio = (x - rect.left) / rect.width;
  if (ratio < CLICK_ZONE_SPLIT) return 'left';
  if (ratio > 1 - CLICK_ZONE_SPLIT) return 'right';
  return 'center';
}

/**
 * @param {Event} event
 */
function isPlayerChrome(event, player, point) {
  const target = event.target;
  if (target instanceof Element && target.closest(UI_CHROME_SELECTOR)) return true;
  if (!point) return false;
  const root = player.el();
  if (!root) return false;
  for (const node of root.querySelectorAll(UI_CHROME_SELECTOR)) {
    if (!(node instanceof HTMLElement) || node.clientHeight <= 0) continue;
    const rect = node.getBoundingClientRect();
    if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {number} seconds
 */
function skipBySeconds(player, seconds) {
  const current = Number(player.currentTime()) || 0;
  const duration = Number(player.duration());
  const next = current + seconds;
  if (seconds < 0) {
    player.currentTime(Math.max(0, next));
    return;
  }
  const end = Number.isFinite(duration) && duration > 0 ? duration : next;
  player.currentTime(Math.min(end, next));
}

/**
 * @param {import('video.js').VideoJsPlayer} player
 */
function togglePlayPause(player) {
  if (player.paused()) {
    player.play();
    return;
  }
  player.pause();
}

/**
 * @param {import('video.js').VideoJsPlayer} player
 * @param {'left' | 'center' | 'right'} zone
 */
function handleDoubleTap(player, zone) {
  if (zone === 'left') {
    skipBySeconds(player, -5);
    return;
  }
  if (zone === 'right') {
    skipBySeconds(player, 5);
    return;
  }
  if (player.isFullscreen()) {
    player.exitFullscreen();
    return;
  }
  player.requestFullscreen();
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
  const ios = isIosWebKit();
  const video = document.createElement('video');
  video.className = 'video-js vjs-big-play-centered vjs-fill';
  video.playsInline = true;
  video.controls = false;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.removeAttribute('controls');
  video.preload = 'auto';
  if (!ios) {
    video.crossOrigin = 'anonymous';
  }
  host.classList.toggle('nas4usb-videojs-host--ios', ios);
  host.replaceChildren(video);

  let pendingClick = 0;
  /** @type {{ time: number, x: number, y: number } | null} */
  let lastTap = null;
  let handledByPointer = false;
  const cancelPendingClick = () => {
    if (!pendingClick) return;
    window.clearTimeout(pendingClick);
    pendingClick = 0;
  };

  /**
   * @param {Event} event
   */
  const handleSurfaceTap = (event) => {
    const point = clientPoint(event);
    if (isPlayerChrome(event, player, point)) return;
    if (!point) return;
    const now = Date.now();
    const zone = clickZone(player, point.x, point.y);
    const isDouble =
      lastTap &&
      now - lastTap.time <= DOUBLE_TAP_MS &&
      Math.abs(point.x - lastTap.x) <= DOUBLE_TAP_PX &&
      Math.abs(point.y - lastTap.y) <= DOUBLE_TAP_PX;

    if (isDouble) {
      cancelPendingClick();
      lastTap = null;
      handleDoubleTap(player, zone);
      return;
    }

    lastTap = { time: now, x: point.x, y: point.y };
    if (zone !== 'center') return;
    cancelPendingClick();
    pendingClick = window.setTimeout(() => {
      pendingClick = 0;
      player.userActive(true);
      togglePlayPause(player);
    }, CLICK_DELAY_MS);
  };

  const player = videojs(video, {
    controls: true,
    autoplay: !ios,
    preload: 'auto',
    fill: true,
    responsive: true,
    language: 'ko',
    restoreEl: true,
    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    inactivityTimeout: 2500,
    liveui: false,
    liveTracker: {
      trackingThreshold: 36_000,
      liveTolerance: 15,
    },
    enableSmoothSeeking: false,
    disablePictureInPicture: ios,
    spatialNavigation: {
      enabled: !ios,
      horizontalSeek: !ios,
    },
    userActions: {
      click: false,
      doubleClick: false,
      hotkeys: !ios,
    },
    html5: {
      vhs: { overrideNative: !ios },
      nativeControlsForTouch: false,
      nativeAudioTracks: true,
      nativeVideoTracks: true,
      nativeTextTracks: true,
    },
    controlBar: {
      volumePanel: { inline: false },
      skipButtons: {
        backward: 10,
        forward: 10,
      },
      children: [
        'playToggle',
        'SkipBackward5',
        'SkipForward5',
        'skipBackward',
        'skipForward',
        'volumePanel',
        'currentTimeDisplay',
        'timeDivider',
        'durationDisplay',
        'progressControl',
        'remainingTimeDisplay',
        'playbackRateMenuButton',
        'chaptersButton',
        'descriptionsButton',
        'subsCapsButton',
        'audioTrackButton',
        'pictureInPictureToggle',
        'fullscreenToggle',
      ],
    },
  });

  patchTimelineClock(player, clock, { nativeSeek: ios });

  /** @type {HTMLElement | null} */
  let surfaceEl = null;
  /** @type {{ x: number, y: number } | null} */
  let pointerStart = null;

  const onPointerDown = (event) => {
    if (event.isPrimary === false) return;
    const point = clientPoint(event);
    if (isPlayerChrome(event, player, point)) {
      pointerStart = null;
      return;
    }
    pointerStart = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event) => {
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = clientPoint(event);
    if (isPlayerChrome(event, player, point)) {
      pointerStart = null;
      return;
    }
    const start = pointerStart;
    pointerStart = null;
    if (
      start &&
      (Math.abs(event.clientX - start.x) > DOUBLE_TAP_PX || Math.abs(event.clientY - start.y) > DOUBLE_TAP_PX)
    ) {
      return;
    }
    handledByPointer = true;
    window.setTimeout(() => {
      handledByPointer = false;
    }, 0);
    handleSurfaceTap(event);
  };

  const onPointerCancel = () => {
    pointerStart = null;
  };

  const onTouchEnd = (event) => {
    if (handledByPointer) return;
    if (event.touches && event.touches.length > 0) return;
    const point = clientPoint(event);
    if (isPlayerChrome(event, player, point)) return;
    handleSurfaceTap(event);
  };

  player.ready(() => {
    player.trigger('durationchange');
    video.controls = false;
    video.removeAttribute('controls');
    surfaceEl = player.el();
    if (!surfaceEl) return;
    surfaceEl.addEventListener('pointerdown', onPointerDown);
    surfaceEl.addEventListener('pointerup', onPointerUp);
    surfaceEl.addEventListener('pointercancel', onPointerCancel);
    if (!ios) {
      surfaceEl.addEventListener('touchend', onTouchEnd);
    }
  });

  return {
    player,
    video,
    dispose: () => {
      cancelPendingClick();
      if (surfaceEl) {
        surfaceEl.removeEventListener('pointerdown', onPointerDown);
        surfaceEl.removeEventListener('pointerup', onPointerUp);
        surfaceEl.removeEventListener('pointercancel', onPointerCancel);
        if (!ios) {
          surfaceEl.removeEventListener('touchend', onTouchEnd);
        }
        surfaceEl = null;
      }
      try {
        player.dispose();
      } catch {
        // already disposed
      }
      host.replaceChildren();
    },
  };
}
