import { isTiptapDocumentRelativePath } from '../../shared/tiptapAssetPaths.js';
import { entryExtensionOf } from './filePassword/secPaths.js';
import {
  isArchiveExtension,
  isAudioExtension,
  isHtmlExtension,
  isImageExtension,
  isPdfExtension,
  isVideoExtension,
} from './media/mediaTypes.js';

/** @typedef {'folder' | 'image' | 'text' | 'markdown' | 'html' | 'tiptap' | 'comic' | 'pdf'} FilePreviewKind */

/**
 * Video/audio play in the dedicated player, not the explorer preview pane.
 *
 * @param {{ isDirectory?: boolean, name?: string, relativePath?: string, extension?: string } | null | undefined} entry
 */
export function isAudioOrVideoEntry(entry) {
  if (!entry || entry.isDirectory) return false;
  const ext = String(entryExtensionOf(entry) || '').toLowerCase();
  return isAudioExtension(ext) || isVideoExtension(ext);
}

/**
 * Selected text inside a preview root, including same-origin iframes.
 * @param {Element | null | undefined} root
 */
export function selectedTextInPreview(root) {
  if (!root) return '';

  const fromWindow = (win) => {
    try {
      const selection = win?.getSelection?.();
      if (!selection || selection.isCollapsed) return '';
      return String(selection.toString() || '');
    } catch {
      return '';
    }
  };

  const local = fromWindow(window);
  if (local.trim()) {
    const node = window.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (el && root.contains(el)) return local;
  }

  for (const frame of root.querySelectorAll('iframe')) {
    const text = fromWindow(frame.contentWindow);
    if (text.trim()) return text;
  }
  return '';
}

/**
 * Map a contextmenu event (possibly from an iframe) to the parent viewport.
 * @param {MouseEvent} event
 */
export function contextMenuClientPoint(event) {
  const view = event.view;
  const frame = view && view !== window ? view.frameElement : null;
  if (frame instanceof Element) {
    const rect = frame.getBoundingClientRect();
    return { x: event.clientX + rect.left, y: event.clientY + rect.top };
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * @param {{ isDirectory?: boolean, name?: string, relativePath?: string, extension?: string } | null | undefined} entry
 * @returns {FilePreviewKind | null}
 */
export function getFilePreviewKind(entry) {
  if (!entry) return null;
  if (entry.isDirectory) return 'folder';
  if (isAudioOrVideoEntry(entry)) return null;
  const ext = String(entryExtensionOf(entry) || '').toLowerCase();
  if (isImageExtension(ext)) return 'image';
  if (ext === 'txt' || ext === 'sql') return 'text';
  if (ext === 'md') return 'markdown';
  if (isHtmlExtension(ext)) return 'html';
  if (ext === 'tiptap' || isTiptapDocumentRelativePath(entry.relativePath || entry.name)) {
    return 'tiptap';
  }
  if (isPdfExtension(ext)) return 'pdf';
  if (isArchiveExtension(ext)) return 'comic';
  return null;
}

/**
 * @param {{ isDirectory?: boolean, name?: string, relativePath?: string, extension?: string } | null | undefined} entry
 */
export function canPreviewEntry(entry) {
  return getFilePreviewKind(entry) != null;
}
