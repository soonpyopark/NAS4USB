import { useRef } from 'react';

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
      if (requireTargetSelf && event.target !== event.currentTarget) return;
      if (!press.onBackdrop) return;
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
