import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseTiptapFileBase64, readSidecarAssets } from './package.js';
import {
  packageAssetUrlToFileName,
  normalizeTiptapAssetUrls,
  toPackageAssetUrl,
} from './assetUrls.js';
import { getTiptapFileStem } from './document.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';
import { exportFileName } from '../browserDownload.js';
import { encodeTextBase64 } from '../text/textIO.js';
import { saveFileToPickedFolder } from '../saveToFolder.js';
import tiptapEditorCss from '../../styles/tiptap-editor.css?raw';
import printPaginationCss from '../../styles/print-pagination.css?raw';

async function loadTipTapEditorView() {
  const mod = await import('../../components/editors/TipTapEditorView.jsx');
  return mod.default;
}

/** Page chrome + hide editor UI so the exported file matches the editing canvas. */
const BASE_CSS = `
  @page { size: A3; margin: 16mm; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  }
  .tiptap-export-page {
    box-sizing: border-box;
    max-width: 297mm;
    width: 100%;
    margin: 0 auto;
  }
  .tiptap-export-page .tiptap-editor-shell { background: transparent; overflow: visible; }
  .tiptap-export-page .tiptap-editor-shell__scroll { overflow: visible; }
  .tiptap-export-page .tiptap {
    box-sizing: border-box;
    max-width: 100%;
    padding: 0;
  }
  .tiptap-export-page .tiptap-toolbar,
  .tiptap-export-page .tiptap-bubble-menu,
  .tiptap-export-page .tiptap-floating-menu,
  .tiptap-export-page .tiptap-toc-panel,
  .tiptap-export-page .tiptap-search-bar { display: none !important; }
  @media print {
    body { padding: 0; }
    .tiptap-export-page { max-width: none; }
  }
  ${printPaginationCss}
`;

/** @param {HTMLElement} container */
async function waitForImagesToSettle(container, timeoutMs = 8000) {
  const images = Array.from(container.querySelectorAll('img'));
  const videos = Array.from(container.querySelectorAll('video'));
  const audios = Array.from(container.querySelectorAll('audio'));
  if (images.length === 0 && videos.length === 0 && audios.length === 0) return;

  await Promise.race([
    Promise.all([
      ...images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }),
      ...videos.map((video) => {
        if (video.readyState >= 1) return Promise.resolve();
        return new Promise((resolve) => {
          video.addEventListener('loadedmetadata', resolve, { once: true });
          video.addEventListener('error', resolve, { once: true });
        });
      }),
      ...audios.map((audio) => {
        if (audio.readyState >= 1) return Promise.resolve();
        return new Promise((resolve) => {
          audio.addEventListener('loadedmetadata', resolve, { once: true });
          audio.addEventListener('error', resolve, { once: true });
        });
      }),
    ]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * @param {string | null} url
 * @param {Map<string, string>} dataUrlByFileName
 */
function assetDataUrl(url, dataUrlByFileName) {
  if (!url || url.startsWith('data:')) return null;

  const fileName = packageAssetUrlToFileName(url);
  if (fileName) return dataUrlByFileName.get(fileName) ?? null;

  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return null;
  }
  if (decoded === url) return null;
  const decodedName = packageAssetUrlToFileName(decoded);
  return decodedName ? dataUrlByFileName.get(decodedName) ?? null : null;
}

/**
 * The media node views start from the stored `assets/…` path and swap in the inlined
 * data URL from an effect, so a heavy document can still hold the unresolved path when
 * the DOM is read — a note with 39 images shipped every `src` unresolved, because the
 * failed `assets/…` requests let `waitForImagesToSettle` return before React committed
 * the swap. Rewrite the markup here instead of waiting on that race.
 *
 * @param {HTMLElement} container
 * @param {Map<string, string>} dataUrlByFileName
 */
function inlineAssetUrls(container, dataUrlByFileName) {
  if (dataUrlByFileName.size === 0) return;

  for (const el of Array.from(container.querySelectorAll('img, video, audio, source'))) {
    const dataUrl = assetDataUrl(el.getAttribute('src'), dataUrlByFileName);
    if (!dataUrl) continue;
    el.setAttribute('src', dataUrl);
    // The image node view raises its failure notice on the unresolved path and never
    // clears it, so the caption would ship next to an image that now loads.
    el.closest('.tiptap-image-wrap')?.querySelector('.tiptap-image-missing')?.remove();
  }

  // File attachments keep the package path so the resolved href stays recoverable.
  for (const anchor of Array.from(container.querySelectorAll('a[data-asset-src]'))) {
    const dataUrl = assetDataUrl(anchor.getAttribute('data-asset-src'), dataUrlByFileName);
    if (dataUrl) anchor.setAttribute('href', dataUrl);
  }
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

/**
 * @param {unknown} editorOrContent
 * @returns {import('@tiptap/core').JSONContent | null}
 */
function resolveContentJson(editorOrContent) {
  if (!editorOrContent) return null;
  if (typeof editorOrContent.getJSON === 'function') {
    return editorOrContent.getJSON();
  }
  return /** @type {import('@tiptap/core').JSONContent} */ (editorOrContent);
}

/**
 * Reads a `.tiptap` file from disk and exports it as a standalone HTML file.
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportTiptapFileAsHtml(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const parsed = await parseTiptapFileBase64(base64);
  return exportTiptapContentAsHtml({
    relativePath,
    fileName,
    content: parsed.content,
    embeddedAssets: parsed.embeddedAssets,
    title: parsed.title,
  });
}

/**
 * @param {string} relativePath
 */
async function loadLiveEmbeddedAssets(relativePath) {
  const sidecarAssets = await readSidecarAssets(relativePath);
  return sidecarAssets.map((asset) => ({
    path: toPackageAssetUrl(asset.fileName),
    base64: asset.base64,
  }));
}

/**
 * Live TipTap → WYSIWYG HTML (editor canvas CSS, not Hangul/HWPX chrome).
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 */
export async function exportLiveTiptapContentAsHtml(relativePath, fileName, editorOrContent) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  const content = resolveContentJson(editorOrContent);
  if (!content) {
    throw new Error('내보낼 TipTap 문서가 없습니다.');
  }
  return exportTiptapContentAsHtml({
    relativePath,
    fileName,
    content,
    embeddedAssets,
  });
}

/**
 * Same WYSIWYG HTML as the HTML export, returned instead of saved.
 * Used by the PDF export, which prints this document with Chromium.
 *
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').Editor | import('@tiptap/core').JSONContent} editorOrContent
 * @returns {Promise<{ title: string, html: string }>}
 */
export async function buildLiveTiptapExportHtml(relativePath, fileName, editorOrContent) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  const content = resolveContentJson(editorOrContent);
  if (!content) {
    throw new Error('내보낼 TipTap 문서가 없습니다.');
  }
  return buildTiptapExportHtml({ relativePath, fileName, content, embeddedAssets });
}

/**
 * Off-screen TipTap render + tiptap-editor.css → standalone HTML matching the editor.
 *
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets: { path: string, base64: string }[],
 *   title?: string,
 * }} input
 * @returns {Promise<{ title: string, html: string }>}
 */
async function buildTiptapExportHtml({
  relativePath,
  fileName,
  content,
  embeddedAssets,
  title: titleInput,
}) {
  const title =
    (titleInput && titleInput !== 'NoName' ? titleInput : getTiptapFileStem(fileName)) || 'NoName';

  /** @type {Map<string, string>} */
  const dataUrlByFileName = new Map();
  for (const asset of embeddedAssets) {
    const assetFileName = packageAssetUrlToFileName(asset.path) ?? asset.path;
    dataUrlByFileName.set(
      assetFileName,
      `data:${guessMimeFromFileName(assetFileName)};base64,${asset.base64}`,
    );
  }

  async function resolveFileUrl(url) {
    const assetFileName = packageAssetUrlToFileName(url);
    if (assetFileName && dataUrlByFileName.has(assetFileName)) {
      return dataUrlByFileName.get(assetFileName);
    }
    return url;
  }

  const normalizedContent = normalizeTiptapAssetUrls(content, relativePath);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-100000px';
  container.style.width = '900px';
  document.body.appendChild(container);

  const TipTapEditorView = await loadTipTapEditorView();
  const root = createRoot(container);
  try {
    await new Promise((resolve) => {
      root.render(
        createElement(TipTapEditorView, {
          relativePath,
          initialContent: normalizedContent,
          collaboration: null,
          readOnly: true,
          resolveFileUrl,
          onReady: () => setTimeout(resolve, 80),
        }),
      );
    });

    await waitForImagesToSettle(container);
    inlineAssetUrls(container, dataUrlByFileName);

    const bodyHtml = container.innerHTML;
    const css = [tiptapEditorCss, BASE_CSS].join('\n');
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
<div class="tiptap-export-page">${bodyHtml}</div>
</body>
</html>
`;

    return { title, html };
  } finally {
    root.unmount();
    container.remove();
  }
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets: { path: string, base64: string }[],
 *   title?: string,
 * }} input
 */
async function exportTiptapContentAsHtml(input) {
  const { title, html } = await buildTiptapExportHtml(input);
  return saveFileToPickedFolder({
    fileName: exportFileName(title, 'html'),
    base64: encodeTextBase64(html),
    mimeType: 'text/html;charset=utf-8',
    title: 'HTML을 저장할 폴더 선택',
  });
}
