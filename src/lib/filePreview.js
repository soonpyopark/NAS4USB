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
