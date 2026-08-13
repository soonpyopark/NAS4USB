import { useEffect, useState } from 'react';
import {
  applySpellcheckEnabled,
  isSpellcheckEnabled,
  subscribeSpellcheckEnabled,
} from '../lib/spellcheck.js';

/**
 * Live Chromium spellcheck preference (환경설정 → 일반).
 */
export function useSpellcheckEnabled() {
  const [enabled, setEnabled] = useState(() => isSpellcheckEnabled());

  useEffect(() => subscribeSpellcheckEnabled(setEnabled), []);

  useEffect(() => {
    let cancelled = false;
    void window.nas4usb?.settings
      ?.getTheme?.()
      .then((theme) => {
        if (cancelled) return;
        setEnabled(applySpellcheckEnabled(theme?.spellcheckEnabled === true));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
