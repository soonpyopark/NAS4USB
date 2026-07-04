import { bindTextEditor } from './textEditorAdapter.js';
import { bindCollaborationPointers, trackLocalPointer } from '../collaborationPointers.js';

/**
 * @param {HTMLElement} root
 */
function getCaretOffset(root) {
  if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
    return root.selectionStart ?? 0;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;

  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

/**
 * @param {HTMLElement} root
 * @param {number} offset
 */
function setCaretOffset(root, offset) {
  const selection = window.getSelection();
  const range = document.createRange();
  let remaining = Math.max(0, offset);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * @param {import('y-websocket').WebsocketProvider} provider
 * @param {import('../../lib/rhwp/types.js').RhwpEditorHandle} editor
 */
function bindRhwpAwareness(provider, editor) {
  const surface = editor.getEditableElement?.();
  if (!surface || !provider?.awareness) {
    return () => {};
  }

  const mountElement =
    surface instanceof HTMLIFrameElement
      ? surface
      : surface instanceof HTMLTextAreaElement || surface instanceof HTMLInputElement
        ? surface
        : surface.closest('.relative') ?? surface.parentElement ?? surface;

  return bindCollaborationPointers(provider, mountElement, {
    subscribeLocal: (publish) => {
      if (typeof editor.onPointerMove === 'function') {
        return editor.onPointerMove((pointer) => publish(pointer));
      }

      if (surface instanceof HTMLTextAreaElement || surface instanceof HTMLInputElement) {
        return trackLocalPointer(surface, publish);
      }

      return () => {};
    },
  });
}

/**
 * rhwp 에디터를 Y.Text 및 awareness에 바인딩합니다.
 * getHwpxBase64/setHwpxBase64 → HWPX 바이너리(documentBase64)
 * getHtml/setHtml → HTML(documentHtml)
 */
export function bindRhwpEditor(ydoc, editor, options = {}) {
  const usesBinary =
    typeof editor.getHwpxBase64 === 'function' && typeof editor.setHwpxBase64 === 'function';
  const usesHtml = typeof editor.getHtml === 'function' && typeof editor.setHtml === 'function';

  /** @type {{ getText: () => string, setText: (value: string, origin?: string) => void | Promise<void>, onChange: (cb: (value: string, origin?: string) => void) => () => void, getEditableElement?: () => HTMLElement | null, setEditable?: (enabled: boolean) => void, onPointerMove?: (cb: (pointer: { px: number, py: number, visible: boolean }) => void) => () => void }} */
  let contentEditor;

  if (usesBinary) {
    contentEditor = {
      getText: () => editor.getHwpxBase64(),
      setText: (value, origin) => editor.setHwpxBase64(value, origin),
      onChange: (callback) =>
        editor.onChange((content, origin) => {
          callback(content, origin);
        }),
      getEditableElement: () => editor.getEditableElement?.() ?? null,
      setEditable: (enabled) => editor.setEditable?.(enabled),
      onPointerMove: (callback) => editor.onPointerMove?.(callback) ?? (() => {}),
    };
  } else if (usesHtml) {
    contentEditor = {
      getText: () => editor.getHtml(),
      setText: (value, origin) => editor.setHtml(value, origin),
      onChange: (callback) =>
        editor.onChange((content, origin) => {
          callback(content, origin);
        }),
      getEditableElement: () => editor.getEditableElement?.() ?? null,
      setEditable: (enabled) => editor.setEditable?.(enabled),
      onPointerMove: (callback) => editor.onPointerMove?.(callback) ?? (() => {}),
    };
  } else {
    contentEditor = editor;
  }

  const fieldName = usesBinary
    ? 'documentBase64'
    : usesHtml
      ? 'documentHtml'
      : options.fieldName ?? 'document';

  const initialContent = usesBinary
    ? options.initialBase64 ?? ''
    : usesHtml
      ? options.initialHtml ?? editor.getHtml?.() ?? ''
      : options.initialText ?? editor.getText?.() ?? '';

  const binder = bindTextEditor(ydoc, contentEditor, {
    ...options,
    fieldName,
    initialText: initialContent,
  });
  const awarenessCleanup = options.provider ? bindRhwpAwareness(options.provider, editor) : null;

  editor.setEditable?.(true);

  const cleanup = () => {
    editor.setEditable?.(false);
    awarenessCleanup?.();
    binder.destroy();
  };

  if (options.provider) {
    const onSync = (isSynced) => {
      if (isSynced) binder.resync();
    };
    options.provider.on('sync', onSync);
    return () => {
      options.provider.off('sync', onSync);
      cleanup();
    };
  }

  return cleanup;
}

export { getCaretOffset, setCaretOffset };
