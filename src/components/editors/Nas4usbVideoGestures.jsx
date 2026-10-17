import { useEffect, useRef } from 'react';
import { usePlayer } from '@videojs/react/video';
import {
  CLICK_DELAY_MS,
  CLICK_ZONE_SPLIT,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_PX,
  UI_CHROME_SELECTOR,
} from '../../lib/media/videoJsPlayer.js';

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
 * @param {HTMLElement} root
 * @param {number} x
 * @returns {'left' | 'center' | 'right'}
 */
function clickZone(root, x) {
  const rect = root.getBoundingClientRect();
  if (rect.width <= 0 || !Number.isFinite(x)) return 'center';
  const ratio = (x - rect.left) / rect.width;
  if (ratio < CLICK_ZONE_SPLIT) return 'left';
  if (ratio > 1 - CLICK_ZONE_SPLIT) return 'right';
  return 'center';
}

/**
 * @param {Event} event
 * @param {HTMLElement} root
 * @param {{ x: number, y: number } | null} point
 */
function isPlayerChrome(event, root, point) {
  const target = event.target;
  if (target instanceof Element && target.closest(UI_CHROME_SELECTOR)) return true;
  if (!point) return false;
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
 * Classic Video.js 8 surface gestures on Video.js 10:
 * center tap = play/pause, L/R double-tap = ±5s, center double-tap = fullscreen.
 *
 * @param {{ ios?: boolean }} props
 */
export default function Nas4usbVideoGestures({ ios = false }) {
  const store = usePlayer();
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const paused = usePlayer((s) => s.paused);
  const isFullscreen = usePlayer((s) => s.isFullscreen);
  const stateRef = useRef({ currentTime: 0, duration: Number.NaN, paused: true, isFullscreen: false });
  stateRef.current = {
    currentTime: Number(currentTime) || 0,
    duration: Number(duration),
    paused: Boolean(paused),
    isFullscreen: Boolean(isFullscreen),
  };

  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const pendingClickRef = useRef(0);
  const lastTapRef = useRef(/** @type {{ time: number, x: number, y: number } | null} */ (null));
  const pointerStartRef = useRef(/** @type {{ x: number, y: number } | null} */ (null));

  useEffect(() => {
    const root = rootRef.current?.parentElement;
    if (!root) return undefined;

    const cancelPending = () => {
      if (!pendingClickRef.current) return;
      window.clearTimeout(pendingClickRef.current);
      pendingClickRef.current = 0;
    };

    const skipBy = (seconds) => {
      const { currentTime: current, duration: full } = stateRef.current;
      const next = current + seconds;
      if (seconds < 0) {
        store.seek?.(Math.max(0, next));
        return;
      }
      const end = Number.isFinite(full) && full > 0 ? full : next;
      store.seek?.(Math.min(end, next));
    };

    const togglePlay = () => {
      if (stateRef.current.paused) void store.play?.();
      else store.pause?.();
    };

    const handleDouble = (zone) => {
      if (zone === 'left') {
        skipBy(-5);
        return;
      }
      if (zone === 'right') {
        skipBy(5);
        return;
      }
      if (stateRef.current.isFullscreen) void store.exitFullscreen?.();
      else void store.requestFullscreen?.();
    };

    const handleSurfaceTap = (event) => {
      const point = clientPoint(event);
      if (isPlayerChrome(event, root, point) || !point) return;
      const now = Date.now();
      const zone = clickZone(root, point.x);
      const last = lastTapRef.current;
      const isDouble =
        last &&
        now - last.time <= DOUBLE_TAP_MS &&
        Math.abs(point.x - last.x) <= DOUBLE_TAP_PX &&
        Math.abs(point.y - last.y) <= DOUBLE_TAP_PX;

      if (isDouble) {
        cancelPending();
        lastTapRef.current = null;
        handleDouble(zone);
        return;
      }

      lastTapRef.current = { time: now, x: point.x, y: point.y };
      if (zone !== 'center') return;
      cancelPending();
      pendingClickRef.current = window.setTimeout(() => {
        pendingClickRef.current = 0;
        togglePlay();
      }, CLICK_DELAY_MS);
    };

    const onPointerDown = (event) => {
      if (event.isPrimary === false) return;
      const point = clientPoint(event);
      if (isPlayerChrome(event, root, point)) {
        pointerStartRef.current = null;
        return;
      }
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event) => {
      if (event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const point = clientPoint(event);
      if (isPlayerChrome(event, root, point)) {
        pointerStartRef.current = null;
        return;
      }
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (
        start &&
        (Math.abs(event.clientX - start.x) > DOUBLE_TAP_PX ||
          Math.abs(event.clientY - start.y) > DOUBLE_TAP_PX)
      ) {
        return;
      }
      handleSurfaceTap(event);
    };

    const onPointerCancel = () => {
      pointerStartRef.current = null;
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);

    return () => {
      cancelPending();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [ios, store]);

  return <div ref={rootRef} className="nas4usb-classic-gesture-anchor" aria-hidden="true" />;
}
