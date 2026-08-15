import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TiptapFileView from '../../components/editors/tiptap/TiptapFileView.jsx';

/**
 * @param {{
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   includeNodeView?: boolean,
 * }} [options]
 */
export function createTiptapFileExtension(options = {}) {
  const { resolveFileUrl, includeNodeView = true } = options;

  return Node.create({
    name: 'fileAttachment',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return {
        HTMLAttributes: { class: 'tiptap-file' },
        resolveFileUrl,
      };
    },

    addAttributes() {
      return {
        src: { default: null },
        name: { default: null },
        mime: { default: null },
        size: { default: null },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'a[data-type="file-attachment"]',
          getAttrs: (element) => {
            if (!(element instanceof HTMLElement)) return false;
            return {
              src:
                element.getAttribute('data-asset-src') ||
                element.getAttribute('href'),
              name: element.getAttribute('data-name') || element.textContent || null,
              mime: element.getAttribute('data-mime'),
              size: element.getAttribute('data-size'),
            };
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes, node }) {
      const name = node.attrs.name || 'file';
      return [
        'a',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          'data-type': 'file-attachment',
          href: node.attrs.src,
          'data-asset-src': node.attrs.src || undefined,
          'data-name': name,
          'data-mime': node.attrs.mime || undefined,
          'data-size': node.attrs.size || undefined,
          download: name,
          target: '_blank',
          rel: 'noopener noreferrer',
        }),
        name,
      ];
    },

    addCommands() {
      return {
        setFileAttachment:
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
      return ReactNodeViewRenderer(TiptapFileView);
    },
  });
}
