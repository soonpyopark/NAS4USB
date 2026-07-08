import { bindTextEditor } from './textEditorAdapter.js';

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
 * rhwp 에디터를 Y.Text 및 awareness에 바인딩합니다.
 * getHwpxBase64/setHwpxBase64 → HWPX 바이너리(documentBase64)
 * getHtml/setHtml → HTML(documentHtml)
 */
export function bindRhwpEditor(ydoc, editor, options = {}) {
  const usesBinary =
    typeof editor.getHwpxBase64 === 'function' && typeof editor.setHwpxBase64 === 'function';
  const usesHtml = typeof editor.getHtml === 'function' && typeof editor.setHtml === 'function';

  /** @type {{ getText: () => string, setText: (value: string, origin?: string) => void | Promise<void>, onChange: (cb: (value: string, origin?: string) => void) => () => void, getEditableElement?: () => HTMLElement | null, setEditable?: (enabled: boolean) => void }} */
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
    deferSeedUntilSync: Boolean(options.provider),
    diskRevision: options.diskRevision ?? '',
    canonicalText: options.canonicalText,
  });

  let disposed = false;
  let hasInitialSynced = false;

  const cleanup = () => {
    disposed = true;
    editor.setEditable?.(false);
    binder.destroy();
  };

  const finishSync = async ({ reconnect = false } = {}) => {
    if (reconnect) {
      binder.resync();
      await binder.flushRemoteApply();
      return;
    }

    if (hasInitialSynced) return;
    hasInitialSynced = true;

    await binder.flushRemoteApply();
    if (disposed) return;
    editor.setEditable?.(options.readOnly ? false : true);
    options.onSynced?.();
  };

  if (options.provider) {
    const onSync = (isSynced) => {
      if (!isSynced) {
        editor.setEditable?.(false);
        return;
      }
      void finishSync({ reconnect: hasInitialSynced });
    };
    options.provider.on('sync', onSync);
    if (options.provider.synced) {
      void finishSync();
    } else {
      editor.setEditable?.(false);
    }
    return () => {
      options.provider.off('sync', onSync);
      cleanup();
    };
  }

  void finishSync();
  return cleanup;
}

export { getCaretOffset, setCaretOffset };
