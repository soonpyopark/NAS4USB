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

/**
 * Insert a workspace / in-doc link from a pasted href. Never opens the file.
 * Selected text keeps its wording; an empty caret gets `label`.
 * @param {import('prosemirror-view').EditorView | null | undefined} view
 * @param {string} href
 * @param {string} label
 */
export function insertPastedWorkspaceLink(view, href, label) {
  const markType = view?.state?.schema?.marks?.link;
  if (!view || !markType) return false;
  const hrefValue = String(href ?? '').trim();
  if (!hrefValue) return false;
  const { from, to } = view.state.selection;
  const tr = view.state.tr;
  const mark = markType.create({ href: hrefValue });
  if (from !== to) {
    tr.addMark(from, to, mark);
  } else {
    const text = String(label || hrefValue).trim() || hrefValue;
    tr.replaceSelectionWith(view.state.schema.text(text, [mark]), false);
  }
  tr.setMeta('preventAutolink', true);
  view.dispatch(tr.scrollIntoView());
  return true;
}
