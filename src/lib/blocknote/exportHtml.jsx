import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import BlockEditorView from '../../components/editors/BlockEditorView.jsx';
import { parseBlockFileBase64, readSidecarAssets } from './package.js';
import { packageAssetUrlToFileName, normalizeBlockAssetUrls, toPackageAssetUrl } from './assetUrls.js';
import { getBlockFileStem } from './document.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';
import { downloadTextFile } from '../downloadTextFile.js';

// BlockNote/Mantine's own stylesheets, inlined verbatim so the exported page needs no
// network access. Inter font-face (@blocknote/core/fonts/inter.css) is deliberately
// skipped — it references woff2 files by a relative path that only resolves inside the
// app's own build output, so embedding it here would just add dead `url()` 404s; the
// page falls back to the system sans-serif stack instead (see BASE_CSS below).
import blockNoteReactCss from '@blocknote/react/style.css?raw';
import blockNoteMantineCss from '@blocknote/mantine/style.css?raw';
import blockEditorCustomCss from '../../styles/block-editor.css?raw';

const BASE_CSS = `
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 40px 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  }
  .block-export-page { max-width: 900px; margin: 0 auto; }
  .block-export-page .block-editor-shell { background: transparent; overflow: visible; }
  .block-export-page .bn-editor { width: 100% !important; padding-inline: 0 !important; }
`;

/** @param {HTMLElement} container */
async function waitForImagesToSettle(container, timeoutMs = 8000) {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

/**
 * Reads a `.block` file from disk and exports it as a standalone HTML file.
 * @param {string} relativePath
 * @param {string} fileName
 */
export async function exportBlockFileAsHtml(relativePath, fileName) {
  const base64 = await window.nas4usb.fs.readFile(relativePath);
  const parsed = await parseBlockFileBase64(base64);
  return exportBlockContentAsHtml({
    relativePath,
    fileName,
    content: parsed.content,
    embeddedAssets: parsed.embeddedAssets,
    title: parsed.title,
  });
}

/**
 * Exports the *currently open, possibly-unsaved* editor content as a standalone HTML
 * file — reads image bytes straight from the edit-time `.block.assets` sidecar rather
 * than the packed `.block` file, so it reflects images inserted since the last save too.
 * @param {string} relativePath
 * @param {string} fileName
 * @param {import('@blocknote/core').PartialBlock[]} content
 */
export async function exportLiveBlockContentAsHtml(relativePath, fileName, content) {
  const sidecarAssets = await readSidecarAssets(relativePath);
  const embeddedAssets = sidecarAssets.map((asset) => ({
    path: toPackageAssetUrl(asset.fileName),
    base64: asset.base64,
  }));
  return exportBlockContentAsHtml({ relativePath, fileName, content, embeddedAssets });
}

/**
 * Renders a block document's content through the same read-only BlockEditorView used
 * for history previews (into an off-screen, unattached-to-layout container) and exports
 * the result as a single self-contained HTML file — BlockNote/Mantine CSS and every
 * embedded image inlined as `data:` URIs — that opens directly in any browser (Windows,
 * macOS, …) via double-click, without NAS4USB or a network connection.
 * @param {{
 *   relativePath: string,
 *   fileName: string,
 *   content: import('@blocknote/core').PartialBlock[],
 *   embeddedAssets: { path: string, base64: string }[],
 *   title?: string,
 * }} input
 */
async function exportBlockContentAsHtml({ relativePath, fileName, content, embeddedAssets, title: titleInput }) {
  const title = (titleInput && titleInput !== 'NoName' ? titleInput : getBlockFileStem(fileName)) || 'NoName';

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

  const normalizedContent = normalizeBlockAssetUrls(content, relativePath);

  // Off-screen (not display:none — BlockNote needs real layout to measure/render) so the
  // user's own view never flashes this intermediate DOM.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-100000px';
  container.style.width = '900px';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise((resolve) => {
      root.render(
        createElement(BlockEditorView, {
          relativePath,
          initialBlocks: normalizedContent,
          collaboration: null,
          readOnly: true,
          resolveFileUrl,
          onReady: () => setTimeout(resolve, 50),
        }),
      );
    });

    await waitForImagesToSettle(container);

    // container.innerHTML is already the `.block-editor-shell` wrapper rendered by
    // BlockEditorView itself — no need to wrap it again.
    const bodyHtml = container.innerHTML;
    const css = [blockNoteReactCss, blockNoteMantineCss, blockEditorCustomCss, BASE_CSS].join('\n');
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
<div class="block-export-page">${bodyHtml}</div>
</body>
</html>
`;

    downloadTextFile(`${title}.html`, html, 'text/html');
  } finally {
    root.unmount();
    container.remove();
  }
}
