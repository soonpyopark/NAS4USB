import { joinRelativePath } from '../fsPaths.js';
import {
  assetFileNameFromAnyUrl,
  getTiptapAssetsDir,
  linkHrefToAssetFileName,
  normalizeAssetPath,
} from './assetUrls.js';

/** Node types that store package assets in `attrs.src`. */
const MEDIA_NODE_TYPES = new Set(['image', 'video', 'audio', 'fileAttachment']);

/**
 * @param {import('@tiptap/core').JSONContent} doc
 * @param {string} tiptapRelativePath
 * @returns {Set<string>} absolute-ish relative paths of referenced sidecar assets
 */
export function collectReferencedAssetPaths(doc, tiptapRelativePath) {
  /** @type {Set<string>} */
  const referenced = new Set();
  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);

  /**
   * @param {import('@tiptap/core').JSONContent | undefined} node
   */
  function walk(node) {
    if (!node || typeof node !== 'object') return;

    const src = node.attrs?.src;
    if (typeof src === 'string') {
      const fileName = assetFileNameFromAnyUrl(src, tiptapRelativePath);
      if (fileName) {
        referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
      }
    }

    const href = node.attrs?.href;
    if (typeof href === 'string') {
      const fileName =
        assetFileNameFromAnyUrl(href, tiptapRelativePath) ||
        linkHrefToAssetFileName(href, tiptapRelativePath);
      if (fileName) {
        referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
      }
    }

    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        const markHref = mark?.attrs?.href;
        if (typeof markHref !== 'string') continue;
        const fileName =
          assetFileNameFromAnyUrl(markHref, tiptapRelativePath) ||
          linkHrefToAssetFileName(markHref, tiptapRelativePath);
        if (fileName) {
          referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
        }
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  }

  walk(doc);
  return referenced;
}

/**
 * Collect asset paths currently present under media nodes in a ProseMirror doc.
 * @param {import('@tiptap/pm/model').Node} doc
 * @param {string} tiptapRelativePath
 * @returns {Set<string>}
 */
export function collectReferencedAssetPathsFromPmDoc(doc, tiptapRelativePath) {
  /** @type {Set<string>} */
  const referenced = new Set();
  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);

  doc.descendants((node) => {
    if (MEDIA_NODE_TYPES.has(node.type.name)) {
      const src = node.attrs?.src;
      if (typeof src === 'string') {
        const fileName = assetFileNameFromAnyUrl(src, tiptapRelativePath);
        if (fileName) {
          referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
        }
      }
    }
    const href = node.attrs?.href;
    if (typeof href === 'string') {
      const fileName =
        assetFileNameFromAnyUrl(href, tiptapRelativePath) ||
        linkHrefToAssetFileName(href, tiptapRelativePath);
      if (fileName) {
        referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
      }
    }
    for (const mark of node.marks ?? []) {
      const href = mark.attrs?.href;
      if (typeof href !== 'string') continue;
      const fileName =
        assetFileNameFromAnyUrl(href, tiptapRelativePath) ||
        linkHrefToAssetFileName(href, tiptapRelativePath);
      if (fileName) {
        referenced.add(normalizeAssetPath(joinRelativePath(assetsDir, fileName)));
      }
    }
    return true;
  });

  return referenced;
}

/**
 * @param {Iterable<string>} assetPaths
 */
export async function deleteTiptapAssetFiles(assetPaths) {
  for (const assetPath of assetPaths) {
    try {
      await window.nas4usb.fs.delete(assetPath);
    } catch {
      // ignore locked/missing
    }
  }
}

/**
 * Delete files in `{doc}.tiptap.assets/` that are no longer referenced by the document.
 * @param {string} tiptapRelativePath
 * @param {import('@tiptap/core').JSONContent} doc
 */
export async function cleanupUnreferencedTiptapAssets(tiptapRelativePath, doc) {
  const assetsDir = getTiptapAssetsDir(tiptapRelativePath);
  let entries = [];
  try {
    entries = await window.nas4usb.fs.readDir(assetsDir);
  } catch {
    return;
  }

  const referenced = collectReferencedAssetPaths(doc, tiptapRelativePath);
  /** @type {string[]} */
  const orphaned = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const assetPath = normalizeAssetPath(joinRelativePath(assetsDir, entry.name));
    if (!referenced.has(assetPath)) orphaned.push(assetPath);
  }
  await deleteTiptapAssetFiles(orphaned);
}

/**
 * Diff previous vs next referenced sets and delete removed asset files.
 * @param {string} tiptapRelativePath
 * @param {Set<string>} previous
 * @param {Set<string>} next
 */
export async function deleteRemovedTiptapAssets(tiptapRelativePath, previous, next) {
  void tiptapRelativePath;
  /** @type {string[]} */
  const removed = [];
  for (const assetPath of previous) {
    if (!next.has(assetPath)) removed.push(assetPath);
  }
  if (removed.length === 0) return;
  await deleteTiptapAssetFiles(removed);
}
