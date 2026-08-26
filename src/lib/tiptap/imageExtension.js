import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TiptapImageView from '../../components/editors/tiptap/TiptapImageView.jsx';

/**
 * Pixel size from an HTML attribute (`width="320"`) or a CSS length (`width: 320px`).
 * Relative units (`%`, `em`, `auto`) stay unset so the image keeps its natural flow size.
 *
 * @param {string | number | null | undefined} value
 * @returns {number | null}
 */
export function parseImagePixelSize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = /^(\d+(?:\.\d+)?)(px)?$/i.exec(trimmed);
  if (!match) return null;
  const size = Number.parseFloat(match[1]);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : null;
}

/**
 * @param {HTMLElement} element
 * @param {'width' | 'height'} dimension
 */
function readImageSize(element, dimension) {
  return (
    parseImagePixelSize(element.getAttribute(dimension)) ??
    parseImagePixelSize(element.style?.[dimension])
  );
}

/**
 * Image node that resolves package `assets/` URLs through a host-provided resolver
 * (stream URL / blob) without rewriting the document JSON, and keeps a manual size.
 *
 * @param {{
 *   resolveFileUrl?: (url: string) => Promise<string>,
 *   uploadFile?: (file: File) => Promise<string>,
 *   includeNodeView?: boolean,
 *   documentPath?: string,
 * }} [options]
 */
export function createTiptapImageExtension(options = {}) {
  const { resolveFileUrl, uploadFile, includeNodeView = true, documentPath = '' } = options;

  return Image.extend({
    addOptions() {
      return {
        ...this.parent?.(),
        resolveFileUrl,
        uploadFile,
        documentPath,
      };
    },

    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: (element) => readImageSize(element, 'width'),
          renderHTML: (attributes) =>
            attributes.width ? { width: attributes.width } : {},
        },
        height: {
          default: null,
          parseHTML: (element) => readImageSize(element, 'height'),
          renderHTML: (attributes) =>
            attributes.height ? { height: attributes.height } : {},
        },
      };
    },

    addNodeView() {
      if (!includeNodeView) return null;
      return ReactNodeViewRenderer(TiptapImageView);
    },

    renderMarkdown: (node) => {
      const src = String(node.attrs?.src ?? '').trim();
      const alt = String(node.attrs?.alt ?? '').replace(/[\[\]]/g, '');
      return src ? `![${alt}](${src})` : '';
    },
  }).configure({
    allowBase64: false,
    HTMLAttributes: { class: 'tiptap-image' },
  });
}
