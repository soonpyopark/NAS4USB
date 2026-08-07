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
import { encodeTextBase64 } from '../text/textIO.js';
import { getParentPath, joinRelativePath, resolveUniqueName } from '../fsPaths.js';
import tiptapEditorCss from '../../styles/tiptap-editor.css?raw';

/**
 * Write HTML next to the source `.tiptap` file (same folder, unique name).
 * @param {string} sourceRelativePath
 * @param {string} title
 * @param {string} html
 * @returns {Promise<{ relativePath: string, name: string }>}
 */
async function writeHtmlBesideSource(sourceRelativePath, title, html) {
  if (!window.nas4usb?.fs?.writeFile || !window.nas4usb?.fs?.readDir) {
    throw new Error('파일 저장 API를 사용할 수 없습니다.');
  }

  const parentPath = getParentPath(sourceRelativePath);
  const desiredName = `${String(title || 'NoName').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.html`;
  const entries = await window.nas4usb.fs.readDir(parentPath);
  const existingNames = (Array.isArray(entries) ? entries : []).map((entry) => entry.name);
  const uniqueName = resolveUniqueName(existingNames, desiredName);
  const relativePath = joinRelativePath(parentPath, uniqueName);
  await window.nas4usb.fs.writeFile(relativePath, encodeTextBase64(html));
  return { relativePath, name: uniqueName };
}

async function loadTipTapEditorView() {
  const mod = await import('../../components/editors/TipTapEditorView.jsx');
  return mod.default;
}

const BASE_CSS = `
  @page { size: A4; margin: 16mm; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  }
  .tiptap-export-page {
    box-sizing: border-box;
    max-width: 210mm;
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
  .tiptap-export-page .tiptap-floating-menu { display: none !important; }
  @media print {
    body { padding: 0; }
    .tiptap-export-page { max-width: none; }
  }
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

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
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
 * @param {import('@tiptap/core').JSONContent} content
 */
async function loadLiveEmbeddedAssets(relativePath) {
  const sidecarAssets = await readSidecarAssets(relativePath);
  return sidecarAssets.map((asset) => ({
    path: toPackageAssetUrl(asset.fileName),
    base64: asset.base64,
  }));
}

/**
 * Exports the currently open TipTap document (including unsaved sidecar images).
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@tiptap/core').JSONContent} content
 */
export async function exportLiveTiptapContentAsHtml(relativePath, fileName, content) {
  const embeddedAssets = await loadLiveEmbeddedAssets(relativePath);
  return exportTiptapContentAsHtml({ relativePath, fileName, content, embeddedAssets });
}

/**
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content: import('@tiptap/core').JSONContent,
 *   embeddedAssets: { path: string, base64: string }[],
 *   title?: string,
 * }} input
 * @returns {Promise<{ title: string, html: string }>}
 */
async function buildTiptapExportHtml({ relativePath, fileName, content, embeddedAssets, title: titleInput }) {
  const title = (titleInput && titleInput !== 'NoName' ? titleInput : getTiptapFileStem(fileName)) || 'NoName';

  const dataUrlByFileName = new Map();
  for (const asset of embeddedAssets) {
    const assetFileName = packageAssetUrlToFileName(asset.path) ?? asset.path;
    dataUrlByFileName.set(assetFileName, `data:${guessMimeFromFileName(assetFileName)};base64,${asset.base64}`);
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
  const { relativePath } = input;
  const { title, html } = await buildTiptapExportHtml(input);
  return writeHtmlBesideSource(relativePath, title, html);
}
