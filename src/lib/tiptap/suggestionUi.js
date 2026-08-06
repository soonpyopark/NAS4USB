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

    return {
      onStart: (props) => {
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
      },
    };
  };
}
