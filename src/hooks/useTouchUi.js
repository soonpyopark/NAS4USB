import { useEffect, useState } from 'react';

const TOUCH_CLASS = 'touch-ui';

/**
 * Tablet/phone (or a touch-first device without a mouse).
 * A Windows laptop with a trackpad stays on the desktop UI even if it has a touch screen.
 */
export function detectTouchUi() {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const multiTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  // iPadOS reports as Macintosh + fine pointer even without a mouse.
  const ipadOs = /iPad|Macintosh/.test(ua) && multiTouch;
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fineHover && !ipadOs) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  return coarse || noHover || multiTouch || ipadOs;
}

function syncTouchClass(on) {
  document.documentElement.classList.toggle(TOUCH_CLASS, on);
}

/**
 * Live tablet/touch layout flag. Also toggles `html.touch-ui` for CSS.
 */
export function useTouchUi() {
  const [touchUi, setTouchUi] = useState(() => detectTouchUi());

  useEffect(() => {
    const queries = [
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(hover: none)'),
      window.matchMedia('(hover: hover) and (pointer: fine)'),
    ];
    const update = () => {
      const next = detectTouchUi();
      setTouchUi(next);
      syncTouchClass(next);
    };
    update();
    for (const query of queries) query.addEventListener('change', update);
    return () => {
      for (const query of queries) query.removeEventListener('change', update);
    };
  }, []);

  return touchUi;
}
