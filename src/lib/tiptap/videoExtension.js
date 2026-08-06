import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TiptapVideoView from '../../components/editors/tiptap/TiptapVideoView.jsx';

/**
 * @param {{
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   includeNodeView?: boolean,
 * }} [options]
 */
export function createTiptapVideoExtension(options = {}) {
  const { resolveFileUrl, includeNodeView = true } = options;

  return Node.create({
    name: 'video',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return {
        HTMLAttributes: { class: 'tiptap-video' },
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
      return [{ tag: 'video[src]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'video',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          controls: HTMLAttributes.controls === false ? undefined : '',
          preload: 'metadata',
        }),
      ];
    },

    addCommands() {
      return {
        setVideo:
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
      return ReactNodeViewRenderer(TiptapVideoView);
    },
  });
}
