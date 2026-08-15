import { innerFileNameOf } from '../filePassword/secPaths.js';

/** TipTap document JSON (ProseMirror) stored inside `.tiptap` packages. */

/**
 * @returns {import('@tiptap/core').JSONContent}
 */
export function createEmptyTiptapDoc() {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

/**
 * @param {unknown} value
 * @returns {value is import('@tiptap/core').JSONContent}
 */
export function isTiptapDoc(value) {
  return Boolean(value && typeof value === 'object' && value.type === 'doc');
}

/**
 * @param {string} fileName
 */
export function getTiptapFileStem(fileName) {
  const base = innerFileNameOf(fileName);
  return base.replace(/\.tiptap$/i, '') || 'NoName';
}
