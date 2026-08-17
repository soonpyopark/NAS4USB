/**
 * Snapshot the current selection so a modal can apply the link after focus leaves the editor.
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @returns {{ from: number, to: number, href: string } | null}
 */
export function snapshotTiptapLinkSelection(editor) {
  if (!editor) return null;
  const { from, to } = editor.state.selection;
  return {
    from,
    to,
    href: String(editor.getAttributes('link').href || ''),
  };
}

/**
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @param {{ from: number, to: number }} range
 * @param {string} href
 */
export function applyTiptapLink(editor, range, href) {
  if (!editor || editor.isDestroyed) return;
  const from = Number(range?.from);
  const to = Number(range?.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;

  const trimmed = String(href ?? '').trim();
  const chain = editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link');
  if (!trimmed) {
    chain.unsetLink().run();
    return;
  }
  const applied = chain.setLink({ href: trimmed }).run();
  if (applied) return;
  editor
    .chain()
    .focus()
    .setTextSelection({ from, to })
    .extendMarkRange('link')
    .setMark('link', { href: trimmed })
    .setMeta('preventAutolink', true)
    .run();
}
