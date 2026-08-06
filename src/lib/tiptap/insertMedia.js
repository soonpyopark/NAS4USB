/**
 * Insert uploaded media into a TipTap editor / ProseMirror view.
 * @param {import('@tiptap/core').Editor | null | undefined} editor
 * @param {File} file
 * @param {string} url package-relative assets/… URL
 * @returns {boolean}
 */
export function insertTiptapMedia(editor, file, url) {
  if (!editor || !url) return false;
  const type = String(file?.type || '');
  const name = file?.name || 'file';

  if (type.startsWith('image/')) {
    return editor.chain().focus().setImage({ src: url, alt: name }).run();
  }

  if (type.startsWith('video/')) {
    return editor.chain().focus().setVideo({ src: url, title: name, controls: true }).run();
  }

  if (type.startsWith('audio/')) {
    return editor.chain().focus().setAudio({ src: url, title: name, controls: true }).run();
  }

  return editor
    .chain()
    .focus()
    .setFileAttachment({
      src: url,
      name,
      mime: type || null,
      size: typeof file?.size === 'number' ? String(file.size) : null,
    })
    .run();
}

/**
 * Prefer image → video → audio → first file for drop/paste.
 * @param {FileList | File[]} files
 * @returns {File | null}
 */
export function pickTiptapMediaFile(files) {
  const list = [...(files || [])];
  if (!list.length) return null;
  return (
    list.find((file) => file.type.startsWith('image/')) ||
    list.find((file) => file.type.startsWith('video/')) ||
    list.find((file) => file.type.startsWith('audio/')) ||
    list[0] ||
    null
  );
}

/**
 * Insert via ProseMirror transaction (drop at coords).
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {File} file
 * @param {string} url
 * @param {{ left: number, top: number } | null} [coords]
 */
export function insertTiptapMediaAtView(view, file, url, coords = null) {
  const { schema } = view.state;
  const type = String(file?.type || '');
  const name = file?.name || 'file';
  let node = null;

  if (type.startsWith('image/')) {
    node = schema.nodes.image?.create({ src: url, alt: name });
  } else if (type.startsWith('video/')) {
    node = schema.nodes.video?.create({ src: url, title: name, controls: true });
  } else if (type.startsWith('audio/')) {
    node = schema.nodes.audio?.create({ src: url, title: name, controls: true });
  } else {
    node = schema.nodes.fileAttachment?.create({
      src: url,
      name,
      mime: type || null,
      size: typeof file?.size === 'number' ? String(file.size) : null,
    });
  }

  if (!node) return false;

  const tr = view.state.tr;
  if (coords) {
    const pos = view.posAtCoords(coords)?.pos;
    if (typeof pos === 'number') {
      tr.insert(pos, node);
      view.dispatch(tr);
      return true;
    }
  }
  tr.replaceSelectionWith(node);
  view.dispatch(tr);
  return true;
}
