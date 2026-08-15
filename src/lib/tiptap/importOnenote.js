import { generateJSON } from '@tiptap/core';
import { extractImportableHtml } from './importHtml.js';
import { createTiptapExtensions } from './extensions.js';
import { packTiptapContentBase64 } from './package.js';
import { linkHrefToAssetFileName, toPackageAssetUrl } from './assetUrls.js';
import { fileFromDataUrl } from './pasteImages.js';
import {
  guessMimeFromFileName,
  isAudioExtension,
  isImageExtension,
  isVideoExtension,
} from '../../../shared/mediaTypes.js';

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
      try {
        const decoded = decodeURIComponent(asset.originalSrc.replace(/&amp;/g, '&'));
        if (decoded && decoded !== asset.originalSrc) {
          next = next.split(decoded).join(url);
        }
      } catch {
        // keep the originalSrc replacement only
      }
    }
  }
  return next;
}

/**
 * @param {string} fileName
 */
function extensionOf(fileName) {
  const match = String(fileName ?? '').match(/\.([a-z0-9]{2,8})$/i);
  return match ? match[1].toLowerCase() : '';
}

/**
 * @param {string} href
 * @param {Set<string>} assetNames
 */
function assetFileNameFromHref(href, assetNames) {
  const fromPackage = linkHrefToAssetFileName(href);
  if (fromPackage) return fromPackage;
  const base = String(href ?? '')
    .replace(/&amp;/g, '&')
    .replace(/\\/g, '/')
    .split(/[?#]/)[0]
    .split('/')
    .pop();
  if (base && assetNames.has(base)) return base;
  try {
    const decoded = decodeURIComponent(base || '');
    if (decoded && assetNames.has(decoded)) return decoded;
  } catch {
    // ignore
  }
  return null;
}

/**
 * @param {Document} document
 * @param {string} fileName
 * @param {string} [label]
 */
function createEmbeddedFileNode(document, fileName, label) {
  const url = toPackageAssetUrl(fileName);
  const ext = extensionOf(fileName);
  const title = (label || '').trim() || fileName;

  if (isAudioExtension(ext)) {
    const audio = document.createElement('audio');
    audio.setAttribute('src', url);
    audio.setAttribute('controls', '');
    if (title !== fileName) audio.setAttribute('title', title);
    return audio;
  }
  if (isVideoExtension(ext)) {
    const video = document.createElement('video');
    video.setAttribute('src', url);
    video.setAttribute('controls', '');
    if (title !== fileName) video.setAttribute('title', title);
    return video;
  }
  if (isImageExtension(ext)) {
    const img = document.createElement('img');
    img.setAttribute('src', url);
    img.setAttribute('class', 'tiptap-image');
    img.setAttribute('alt', title);
    return img;
  }

  const attachment = document.createElement('a');
  attachment.setAttribute('data-type', 'file-attachment');
  attachment.setAttribute('href', url);
  attachment.setAttribute('data-name', title);
  const mime = guessMimeFromFileName(fileName);
  if (mime) attachment.setAttribute('data-mime', mime);
  attachment.textContent = title;
  return attachment;
}

/**
 * Joplin / OneNote emit inserted files as `<a href="file.mp3">`. Turn those
 * into audio / video / image / file-attachment nodes so they pack as assets.
 *
 * @param {string} html
 * @param {{ fileName: string }[]} assets
 */
function promoteEmbeddedFileLinks(html, assets) {
  if (typeof document === 'undefined') return html;
  const assetNames = new Set((assets || []).map((asset) => asset.fileName).filter(Boolean));
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const anchor of [...template.content.querySelectorAll('a[href]')]) {
    if (anchor.getAttribute('data-type') === 'file-attachment') continue;
    if (anchor.querySelector('img, audio, video')) continue;
    const href = (anchor.getAttribute('href') || '').trim();
    const fileName = assetFileNameFromHref(href, assetNames);
    if (!fileName) continue;
    const label = (anchor.textContent || '').trim();
    anchor.replaceWith(createEmbeddedFileNode(document, fileName, label));
  }

  for (const embed of [...template.content.querySelectorAll('object[data], embed[src]')]) {
    const href = (embed.getAttribute('data') || embed.getAttribute('src') || '').trim();
    const fileName = assetFileNameFromHref(href, assetNames);
    if (!fileName) continue;
    embed.replaceWith(createEmbeddedFileNode(document, fileName, fileName));
  }

  return template.innerHTML;
}

/**
 * @param {string} html
 * @param {{ fileName: string }[]} assets
 */
function appendUnreferencedAssets(html, assets) {
  const extras = (assets || []).filter((asset) => {
    if (!asset.fileName) return false;
    return !String(html ?? '').includes(asset.fileName);
  });
  if (!extras.length) return html;
  if (typeof document === 'undefined') {
    const bits = extras.map((asset) => {
      const url = toPackageAssetUrl(asset.fileName);
      return `<a data-type="file-attachment" href="${url}" data-name="${asset.fileName}">${asset.fileName}</a>`;
    });
    return `${html}<p>${bits.join('<br>')}</p>`;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  for (const asset of extras) {
    template.content.appendChild(createEmbeddedFileNode(document, asset.fileName, asset.fileName));
  }
  return template.innerHTML;
}

/**
 * Rewrite converter HTML so inserted files become TipTap media / attachments.
 *
 * @param {string} html
 * @param {{ fileName: string, base64?: string, originalSrc?: string }[]} assets
 */
export function prepareOnenotePageHtml(html, assets) {
  const list = Array.isArray(assets) ? assets : [];
  let next = rewriteAssetSrcs(html || '', list);
  next = extractInlineSvgs(next, list);
  next = extractDataUrlImages(next, list);
  next = extractImportableHtml(next);
  next = promoteEmbeddedFileLinks(next, list);
  next = appendUnreferencedAssets(next, list);
  return next;
}

/**
 * After host assets are already rewritten to `assets/…`, promote file links.
 *
 * @param {string} html
 * @param {{ fileName: string }[]} assets
 */
export function promoteOnenoteEmbeddedFiles(html, assets) {
  const list = Array.isArray(assets) ? assets : [];
  let next = promoteEmbeddedFileLinks(html || '', list);
  next = appendUnreferencedAssets(next, list);
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
  const html = prepareOnenotePageHtml(page.html || '', assets);

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
