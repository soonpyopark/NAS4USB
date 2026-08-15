import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TiptapAudioView from '../../components/editors/tiptap/TiptapAudioView.jsx';

/**
 * @param {{
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   includeNodeView?: boolean,
 * }} [options]
 */
export function createTiptapAudioExtension(options = {}) {
  const { resolveFileUrl, includeNodeView = true } = options;

  return Node.create({
    name: 'audio',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return {
        HTMLAttributes: { class: 'tiptap-audio' },
        resolveFileUrl,
      };
    },

    addAttributes() {
      return {
        src: { default: null },
        title: { default: null },
        controls: {
          default: true,
          parseHTML: (element) => element.hasAttribute('controls'),
          renderHTML: (attributes) => (attributes.controls ? { controls: '' } : {}),
        },
      };
    },

    parseHTML() {
      return [
        { tag: 'audio[src]' },
        {
          tag: 'audio',
          getAttrs: (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const src =
              element.getAttribute('src') ||
              element.querySelector('source')?.getAttribute('src');
            return src ? { src } : false;
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'audio',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          controls: HTMLAttributes.controls === false ? undefined : '',
          preload: 'metadata',
        }),
      ];
    },

    addCommands() {
      return {
        setAudio:
          (attrs) =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs,
            }),
      };
    },

    addNodeView() {
      if (!includeNodeView) return null;
      return ReactNodeViewRenderer(TiptapAudioView);
    },
  });
}
