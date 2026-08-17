import { useEffect, useState } from 'react';

/**
 * Re-render React chrome (toolbar / menus) when the TipTap selection or doc changes.
 * Skip ticks while a table column is being dragged — each pixel is a transaction
 * and re-rendering the toolbar/TOC makes the table shake.
 * @param {import('@tiptap/core').Editor | null} editor
 */
export function useTiptapEditorTick(editor) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return undefined;
    let frame = 0;
    const bump = () => {
      if (editor.view?.dom?.classList.contains('resize-cursor')) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setTick((value) => value + 1);
      });
    };
    const onPointerUp = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setTick((value) => value + 1);
      });
    };
    editor.view.dom.addEventListener('pointerup', onPointerUp);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    editor.on('focus', bump);
    editor.on('blur', bump);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      editor.view.dom.removeEventListener('pointerup', onPointerUp);
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
      editor.off('focus', bump);
      editor.off('blur', bump);
    };
  }, [editor]);
}
