import { isTiptapDocumentRelativePath } from '../../shared/tiptapAssetPaths.js';
import { entryExtensionOf } from './filePassword/secPaths.js';
import { isArchiveExtension, isImageExtension, isPdfExtension } from './media/mediaTypes.js';

/** @typedef {'folder' | 'image' | 'text' | 'markdown' | 'tiptap' | 'comic' | 'pdf'} FilePreviewKind */

/**
 * @param {{ isDirectory?: boolean, name?: string, relativePath?: string, extension?: string } | null | undefined} entry
 * @returns {FilePreviewKind | null}
 */
export function getFilePreviewKind(entry) {
  if (!entry) return null;
  if (entry.isDirectory) return 'folder';
  const ext = String(entryExtensionOf(entry) || '').toLowerCase();
  if (isImageExtension(ext)) return 'image';
  if (ext === 'txt') return 'text';
  if (ext === 'md') return 'markdown';
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
