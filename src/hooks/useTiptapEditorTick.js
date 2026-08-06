import { useEffect, useState } from 'react';

/**
 * Re-render React chrome (toolbar / menus) when the TipTap selection or doc changes.
 * @param {import('@tiptap/core').Editor | null} editor
 */
export function useTiptapEditorTick(editor) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setTick((value) => value + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    editor.on('focus', bump);
    editor.on('blur', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
      editor.off('focus', bump);
      editor.off('blur', bump);
    };
  }, [editor]);
}
