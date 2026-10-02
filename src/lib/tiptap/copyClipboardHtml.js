import { DOMSerializer } from '@tiptap/pm/model';
import { annotateHtmlWithAssetPaths, rewriteCopiedSliceForClipboard } from './copyPasteAssets.js';

/**
 * @param {import('@tiptap/pm/model').Slice | null | undefined} slice
 */
export function sliceHasImageNodes(slice) {
  if (!slice?.content) return false;
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (node.type?.name === 'image' && String(node.attrs?.src || '').trim()) {
      found = true;
      return;
    }
    node.content?.forEach(visit);
  };
  slice.content.forEach(visit);
  return found;
}

/**
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {import('@tiptap/pm/model').Slice} slice
 */
function serializeCopiedSliceHtml(view, slice) {
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const wrap = document.createElement('div');
  wrap.appendChild(serializer.serializeFragment(slice.content, { document }));
  wrap.setAttribute('data-pm-slice', `${slice.openStart} ${slice.openEnd} ${JSON.stringify([])}`);
  return wrap.outerHTML;
}

/**
 * @param {string} url
 */
async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image fetch failed (${response.status})`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('empty image');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Replace fetchable <img src> with data URLs so OneNote/Word can paste pictures.
 * Sidecar hints (`data-nas-asset-path`) stay on the element for TipTap rematerialize.
 *
 * @param {string} html
 * @param {(url: string) => Promise<string>} [resolveFileUrl]
 */
export async function inlineClipboardImages(html, resolveFileUrl) {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const images = [...template.content.querySelectorAll('img[src]')];
  if (images.length === 0) return html;

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || /^data:/i.test(src)) return;
      try {
        const resolved = resolveFileUrl ? await resolveFileUrl(src) : src;
        const dataUrl = await urlToDataUrl(resolved || src);
        if (dataUrl.startsWith('data:')) img.setAttribute('src', dataUrl);
      } catch {
        // Keep the stream URL + asset path so TipTap paste still works.
      }
    }),
  );
  return template.innerHTML;
}

/**
 * @param {string} html
 * @param {string} text
 */
async function writeHtmlClipboard(html, text) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text || ''], { type: 'text/plain' }),
      }),
    ]);
    return;
  }

  const holder = document.createElement('div');
  holder.contentEditable = 'true';
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.execCommand('copy');
  selection?.removeAllRanges();
  holder.remove();
}

/**
 * Copy the current selection with inlined images for Office/OneNote.
 *
 * @param {import('@tiptap/pm/view').EditorView} view
 * @param {string} sourceTiptapPath
 * @param {(url: string) => Promise<string>} [resolveFileUrl]
 */
export async function writeCopiedTiptapHtml(view, sourceTiptapPath, resolveFileUrl) {
  const slice = rewriteCopiedSliceForClipboard(view.state.selection.content(), sourceTiptapPath);
  const text = slice.content.textBetween(0, slice.content.size, '\n');
  let html = serializeCopiedSliceHtml(view, slice);
  html = annotateHtmlWithAssetPaths(html, sourceTiptapPath);
  html = await inlineClipboardImages(html, resolveFileUrl);
  await writeHtmlClipboard(html, text);
}
