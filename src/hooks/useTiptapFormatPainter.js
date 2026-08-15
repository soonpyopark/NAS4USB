import { useCallback, useEffect, useRef, useState } from 'react';
import { applyFormat, snapshotFormat } from '../lib/tiptap/formatPainter.js';

/**
 * Word-style format painter for TipTap.
 * Click = copy then apply once · double-click = keep applying · Esc cancels.
 * Ctrl+Shift+C copies · Ctrl+Shift+V applies to the current selection.
 *
 * @param {import('@tiptap/core').Editor | null} editor
 * @param {boolean} [disabled]
 */
export function useTiptapFormatPainter(editor, disabled = false) {
  const [mode, setMode] = useState(/** @type {null | 'once' | 'locked'} */ (null));
  const snapshotRef = useRef(/** @type {import('../lib/tiptap/formatPainter.js').FormatSnapshot | null} */ (null));
  const clickTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const capture = useCallback(() => {
    if (!editor || disabled) return null;
    const snapshot = snapshotFormat(editor);
    snapshotRef.current = snapshot;
    return snapshot;
  }, [disabled, editor]);

  const arm = useCallback(
    (nextMode) => {
      if (!capture()) return;
      setMode(nextMode);
    },
    [capture],
  );

  const onButtonClick = useCallback(() => {
    if (disabled) return;
    if (mode) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      setMode(null);
      return;
    }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      arm('once');
      clickTimerRef.current = null;
    }, 220);
  }, [arm, disabled, mode]);

  const onButtonDoubleClick = useCallback(
    (event) => {
      event.preventDefault();
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      if (disabled) return;
      arm('locked');
    },
    [arm, disabled],
  );

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return undefined;
    dom.classList.toggle('is-format-painting', Boolean(mode));
    return () => dom.classList.remove('is-format-painting');
  }, [editor, mode]);

  useEffect(() => {
    if (!editor || disabled || !mode) return undefined;
    const dom = editor.view.dom;

    const onPointerUp = () => {
      if (!snapshotRef.current) return;
      applyFormat(editor, snapshotRef.current);
      if (mode === 'once') setMode(null);
    };

    const timer = window.setTimeout(() => {
      dom.addEventListener('pointerup', onPointerUp);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      dom.removeEventListener('pointerup', onPointerUp);
    };
  }, [disabled, editor, mode]);

  useEffect(() => {
    if (!editor || disabled) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && mode) {
        event.preventDefault();
        setMode(null);
        return;
      }

      const shortcut = (event.ctrlKey || event.metaKey) && event.shiftKey;
      if (!shortcut || event.altKey) return;
      if (!editor.isFocused && event.target !== editor.view.dom) return;

      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        capture();
        return;
      }
      if (key === 'v') {
        if (!snapshotRef.current) return;
        event.preventDefault();
        applyFormat(editor, snapshotRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capture, disabled, editor, mode]);

  return {
    mode,
    onButtonClick,
    onButtonDoubleClick,
  };
}
