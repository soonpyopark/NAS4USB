import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TiptapImageView from '../../components/editors/tiptap/TiptapImageView.jsx';

/**
 * Image node that resolves package `assets/` URLs through a host-provided resolver
 * (stream URL / blob) without rewriting the document JSON.
 *
 * @param {{ resolveFileUrl?: (url: string) => Promise<string> }} [options]
 */
export function createTiptapImageExtension(options = {}) {
  return Image.extend({
    addOptions() {
      return {
        ...this.parent?.(),
        resolveFileUrl: options.resolveFileUrl,
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(TiptapImageView);
    },
  }).configure({
    allowBase64: false,
    HTMLAttributes: { class: 'tiptap-image' },
  });
}
