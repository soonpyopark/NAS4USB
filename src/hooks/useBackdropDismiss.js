import { useEffect, useRef } from 'react';

/**
 * Dismiss a dialog only for a real backdrop click — not a text-drag that
 * started inside the dialog and ended on the dimmed overlay.
 *
 * @param {(() => void) | undefined} onClose
 * @param {{
 *   enabled?: boolean,
 *   requireTargetSelf?: boolean,
 *   moveThreshold?: number,
 * }} [options]
 */
export function useBackdropDismiss(onClose, options = {}) {
  const { enabled = true, requireTargetSelf = true, moveThreshold = 0 } = options;
  const pressRef = useRef({ onBackdrop: false, x: 0, y: 0 });
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    pressRef.current = { onBackdrop: false, x: 0, y: 0 };
    openedAtRef.current = performance.now();
  }, [enabled]);

  if (!enabled || !onClose) return {};

  return {
    onPointerDown(event) {
      pressRef.current = {
        onBackdrop: !requireTargetSelf || event.target === event.currentTarget,
        x: event.clientX,
        y: event.clientY,
      };
    },
    onClick(event) {
      const press = pressRef.current;
      // Overlay often becomes visible in the same click that opened it.
      // That click must not count as a backdrop dismiss (flash-and-gone).
      if (performance.now() - openedAtRef.current < 400) return;
      if (!press.onBackdrop) return;
      if (requireTargetSelf && event.target !== event.currentTarget) return;
      if (
        moveThreshold > 0 &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > moveThreshold
      ) {
        return;
      }
      press.onBackdrop = false;
      onClose();
    },
  };
}
