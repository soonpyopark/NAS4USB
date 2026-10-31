import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import SlashCommandList from '../../components/editors/tiptap/SlashCommandList.jsx';

/**
 * Shared Tippy + ReactRenderer suggestion popup (slash / emoji / mention).
 * @param {{ theme?: string }} [options]
 */
export function createSuggestionRenderer(options = {}) {
  const theme = options.theme || 'tiptap-slash';

  return () => {
    let component;
    let popup;
    /** @type {import('@tiptap/core').Editor | null} */
    let editor = null;

    const restoreEditorFocus = () => {
      const ed = editor;
      if (!ed || ed.isDestroyed) return;
      const focus = () => {
        if (ed.isDestroyed) return;
        try {
          ed.view.focus();
        } catch {
          /* ignore */
        }
        if (!ed.view.hasFocus()) ed.commands.focus();
      };
      // Tippy destroy can steal focus; restore after it is gone.
      queueMicrotask(focus);
      requestAnimationFrame(focus);
    };

    return {
      onStart: (props) => {
        editor = props.editor;
        component = new ReactRenderer(SlashCommandList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme,
          maxWidth: 'none',
        });
      },

      onUpdate(props) {
        editor = props.editor;
        component?.updateProps(props);
        if (!props.clientRect) return;
        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown?.(props) ?? false;
      },

      onExit() {
        popup?.[0]?.destroy();
        component?.destroy();
        popup = undefined;
        component = undefined;
        restoreEditorFocus();
      },
    };
  };
}
