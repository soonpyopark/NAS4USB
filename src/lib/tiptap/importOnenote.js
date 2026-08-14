import { generateJSON } from '@tiptap/core';
import { extractImportableHtml } from './importHtml.js';
import { createTiptapExtensions } from './extensions.js';
import { packTiptapContentBase64 } from './package.js';
import { toPackageAssetUrl } from './assetUrls.js';
import { fileFromDataUrl } from './pasteImages.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';

/**
 * @param {string} title
 * @param {number} index
 */
export function onenotePageFileName(title, index) {
  const stem = String(title ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const prefix = String(index + 1).padStart(2, '0');
  return `${prefix}-${stem || `페이지 ${index + 1}`}.tiptap`;
}

/**
 * @param {string} html
 * @param {{ fileName: string, originalSrc?: string }[]} assets
 */
function rewriteAssetSrcs(html, assets) {
  let next = String(html ?? '');
  for (const asset of assets) {
    if (!asset.fileName) continue;
    const url = toPackageAssetUrl(asset.fileName);
    if (asset.originalSrc) {
      next = next.split(asset.originalSrc).join(url);
    }
  }
  return next;
}

/**
 * @param {string} html
 * @param {{ fileName: string, base64: string, originalSrc?: string }[]} assets
 */
function extractInlineSvgs(html, assets) {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const svgs = [...template.content.querySelectorAll('svg')];
  if (svgs.length === 0) return html;

  for (const svg of svgs) {
    const xml = new XMLSerializer().serializeToString(svg);
    const fileName = `drawing-${assets.length + 1}.svg`;
    assets.push({
      fileName,
      base64: btoa(unescape(encodeURIComponent(xml))),
    });
    const img = document.createElement('img');
    img.setAttribute('src', toPackageAssetUrl(fileName));
    img.setAttribute('class', 'tiptap-image');
    svg.replaceWith(img);
  }
  return template.innerHTML;
}

/**
 * @param {string} html
 * @param {{ fileName: string, base64: string, originalSrc?: string }[]} assets
 */
function extractDataUrlImages(html, assets) {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const img of [...template.content.querySelectorAll('img')]) {
    const src = img.getAttribute('src') || '';
    if (!/^data:/i.test(src)) continue;
    const file = fileFromDataUrl(src);
    if (!file) {
      img.remove();
      continue;
    }
    const ext = (file.type.split('/')[1] || 'png').split('+')[0];
    const fileName = `pasted-image-${assets.length + 1}.${ext}`;
    assets.push({
      fileName,
      base64: src.replace(/^data:[^;]+;base64,/, ''),
    });
    img.setAttribute('src', toPackageAssetUrl(fileName));
  }
  return template.innerHTML;
}

function parseExtensions() {
  return createTiptapExtensions({
    collaboration: null,
    includeImageNodeView: false,
    includeMediaNodeView: false,
    enableSuggestionUi: false,
  });
}

/**
 * @param {{
 *   title: string,
 *   html: string,
 *   assets?: { fileName: string, base64: string, originalSrc?: string }[],
 * }} page
 * @param {number} index
 */
export async function packOnenotePageToTiptap(page, index) {
  const assets = [...(page.assets || [])];
  let html = rewriteAssetSrcs(page.html || '', assets);
  html = extractInlineSvgs(html, assets);
  html = extractDataUrlImages(html, assets);
  html = extractImportableHtml(html);

  const content = generateJSON(html || '<p></p>', parseExtensions());
  const title = page.title || `페이지 ${index + 1}`;
  const fileName = onenotePageFileName(title, index);
  const base64 = await packTiptapContentBase64({ title, content, assets });
  return { fileName, title, base64, content, assets };
}

/**
 * @param {{ title: string, html: string, assets?: { fileName: string, base64: string, originalSrc?: string }[] }[]} pages
 */
export async function packOnenotePagesToTiptap(pages) {
  const list = Array.isArray(pages) ? pages : [];
  /** @type {{ fileName: string, title: string, base64: string, content: import('@tiptap/core').JSONContent, assets: { fileName: string, base64: string }[] }[]} */
  const packed = [];
  for (let index = 0; index < list.length; index += 1) {
    packed.push(await packOnenotePageToTiptap(list[index], index));
  }
  return packed;
}

/**
 * Convert host-extracted assets into Files for live editor upload.
 *
 * @param {{ fileName: string, base64: string }[]} assets
 */
export function onenoteAssetsToFiles(assets) {
  return (assets || []).map((asset) => {
    const binary = atob(asset.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const mime = guessMimeFromFileName(asset.fileName) || 'application/octet-stream';
    return new File([bytes], asset.fileName, { type: mime });
  });
}
