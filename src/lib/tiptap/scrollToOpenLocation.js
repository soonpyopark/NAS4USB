const INDEXED_TYPES = new Set([
  'heading',
  'paragraph',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
]);

/**
 * Scroll the live TipTap editor to the paragraph recorded by the document index.
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @param {{ paragraph?: number } | null | undefined} location
 */
export function scrollTiptapToOpenLocation(editor, location) {
  const target = Number(location?.paragraph);
  if (!editor || !Number.isFinite(target) || target < 1) return false;

  let index = 0;
  let foundPos = null;
  editor.state.doc.descendants((node, pos) => {
    if (!INDEXED_TYPES.has(String(node.type?.name ?? ''))) return true;
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return false;
    index += 1;
    if (index === target) {
      foundPos = pos;
      return false;
    }
    return false;
  });

  if (foundPos == null) return false;
  const dom = editor.view.nodeDOM(foundPos);
  const el = dom instanceof HTMLElement ? dom : editor.view.domAtPos(foundPos + 1)?.node;
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  }
  editor.commands.setTextSelection(foundPos + 1);
  return true;
}
