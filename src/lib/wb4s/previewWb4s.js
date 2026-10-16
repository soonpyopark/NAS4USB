import { generateThumbnail } from '@wb4s-engine/engine/thumbnailRenderer.ts';
import { preloadImages } from '@wb4s-engine/engine/imageRenderer.ts';
import { normalizeWb4sDocument } from '../../wb4s/document.js';

/**
 * @typedef {{
 *   title: string,
 *   pathCount: number,
 *   imageCount: number,
 *   textCount: number,
 *   tableCount: number,
 * }} Wb4sPreviewMeta
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUsableThumbnail(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('data:image') ||
    trimmed.startsWith('blob:') ||
    /^https?:\/\//i.test(trimmed)
  );
}

/**
 * Build explorer preview payload for a `.wb4s` document.
 * Prefer stored `thumbnail`, else generate via the WB4S engine renderer.
 *
 * @param {string} jsonText
 * @returns {Promise<{
 *   imageUrl: string,
 *   meta: Wb4sPreviewMeta,
 *   source: 'stored' | 'generated' | 'meta',
 * }>}
 */
export async function resolveWb4sPreview(jsonText) {
  let doc = /** @type {Record<string, unknown> | null} */ (null);
  try {
    doc = JSON.parse(normalizeWb4sDocument(jsonText));
  } catch {
    doc = null;
  }

  const paths = Array.isArray(doc?.paths) ? doc.paths : [];
  const images = Array.isArray(doc?.images) ? doc.images : [];
  const texts = Array.isArray(doc?.texts) ? doc.texts : [];
  const tables = Array.isArray(doc?.tables) ? doc.tables : [];
  const meta = {
    title: String(doc?.title ?? '').trim() || '제목 없음',
    pathCount: paths.length,
    imageCount: images.length,
    textCount: texts.length,
    tableCount: tables.length,
  };

  if (isUsableThumbnail(doc?.thumbnail)) {
    return { imageUrl: String(doc.thumbnail).trim(), meta, source: 'stored' };
  }

  const isEmpty =
    meta.pathCount + meta.imageCount + meta.textCount + meta.tableCount === 0;
  if (isEmpty) {
    return { imageUrl: '', meta, source: 'meta' };
  }

  try {
    if (images.length > 0) {
      await preloadImages(images);
    }
    const generated = generateThumbnail(paths, images, 480, 300, texts, tables);
    if (generated) {
      return { imageUrl: generated, meta, source: 'generated' };
    }
  } catch (err) {
    console.warn('[wb4s preview] generateThumbnail failed', err);
  }

  return { imageUrl: '', meta, source: 'meta' };
}
