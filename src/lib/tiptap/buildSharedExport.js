/**
 * Shared TipTap → document export body + Hangul/HWPX-aligned HTML chrome.
 * HTML and HWPX both consume the same cleaned body so structure matches.
 */

import { generateHTML } from '@tiptap/core';
import { createTiptapExtensions } from './extensions.js';
import { cleanTiptapExportHtml } from './cleanExportHtml.js';
import {
  packageAssetUrlToFileName,
  normalizeTiptapAssetUrls,
} from './assetUrls.js';
import { guessMimeFromFileName } from '../../../shared/mediaTypes.js';

/**
 * Document CSS tuned to blank.hwpx / Hangul defaults (not TipTap editor chrome).
 * HWP char height 1000 ≈ 10pt; page margins ≈ 25mm L/R, ~15–17mm T/B.
 */
export const TIPTAP_DOCUMENT_EXPORT_CSS = `
  @page { size: A4; margin: 15mm 25mm 17mm 25mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  body {
    padding: 15mm 25mm 17mm;
    font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #000000;
  }
  .tiptap-doc-export {
    box-sizing: border-box;
    max-width: 210mm;
    width: 100%;
    margin: 0 auto;
  }
  .tiptap-doc-export h1 {
    font-size: 26pt;
    font-weight: 700;
    color: #323e4f;
    margin: 0.6em 0 0.35em;
    line-height: 1.25;
  }
  .tiptap-doc-export h2 {
    font-size: 18pt;
    font-weight: 700;
    color: #2f5496;
    margin: 0.55em 0 0.3em;
    line-height: 1.3;
  }
  .tiptap-doc-export h3 {
    font-size: 16pt;
    font-weight: 700;
    color: #4472c4;
    margin: 0.5em 0 0.28em;
    line-height: 1.35;
  }
  .tiptap-doc-export h4,
  .tiptap-doc-export h5,
  .tiptap-doc-export h6 {
    font-size: 12pt;
    font-weight: 700;
    color: #4472c4;
    margin: 0.45em 0 0.25em;
    line-height: 1.4;
  }
  .tiptap-doc-export p {
    margin: 0.35em 0;
  }
  .tiptap-doc-export ul,
  .tiptap-doc-export ol {
    margin: 0.4em 0;
    padding-left: 1.5em;
  }
  .tiptap-doc-export ul { list-style: disc; }
  .tiptap-doc-export ol { list-style: decimal; }
  .tiptap-doc-export blockquote {
    margin: 0.5em 0;
    padding-left: 0.9em;
    border-left: 3px solid #c5c5c5;
    color: #333;
  }
  .tiptap-doc-export a { color: #0563c1; text-decoration: underline; }
  .tiptap-doc-export code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 0.92em;
  }
  .tiptap-doc-export pre {
    margin: 0.5em 0;
    padding: 0.6em 0.75em;
    background: #f5f5f5;
    border: 1px solid #d0d0d0;
    overflow: auto;
    font-size: 9pt;
  }
  .tiptap-doc-export img {
    max-width: 100%;
    height: auto;
  }
  .tiptap-doc-export table,
  .tiptap-doc-export .tiptap-table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.55em 0;
    table-layout: fixed;
  }
  .tiptap-doc-export th,
  .tiptap-doc-export td {
    border: 1px solid #000000;
    padding: 0.25em 0.45em;
    vertical-align: top;
    word-break: break-word;
  }
  .tiptap-doc-export th {
    font-weight: 700;
    background: transparent;
  }
  .tiptap-doc-export hr {
    border: 0;
    border-top: 1px solid #000;
    margin: 0.9em 0;
  }
  @media print {
    body { padding: 0; }
    .tiptap-doc-export { max-width: none; }
  }
`;

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );
}

/**
 * Build the shared cleaned body HTML used by both HTML and HWPX export.
 *
 * @param {{
 *   content?: import('@tiptap/core').JSONContent,
 *   editor?: import('@tiptap/core').Editor | null,
 *   relativePath?: string,
 * }} input
 * @returns {string}
 */
export function buildSharedTiptapExportBody({ content, editor = null, relativePath = '' } = {}) {
  let raw = '';
  if (editor?.getJSON) {
    const json = relativePath
      ? normalizeTiptapAssetUrls(editor.getJSON(), relativePath)
      : editor.getJSON();
    raw = generateHTML(json, createExportExtensions());
  } else if (content) {
    const json = relativePath ? normalizeTiptapAssetUrls(content, relativePath) : content;
    raw = generateHTML(json, createExportExtensions());
  } else if (editor?.getHTML) {
    raw = editor.getHTML();
  }

  return cleanTiptapExportHtml(raw);
}

function createExportExtensions() {
  return createTiptapExtensions({
    collaboration: null,
    includeImageNodeView: false,
    includeMediaNodeView: false,
    enableSuggestionUi: false,
  });
}

/**
 * @param {string} bodyHtml
 * @param {{ path?: string, fileName?: string, base64: string }[]} assets
 * @returns {string}
 */
export function embedAssetsAsDataUrls(bodyHtml, assets) {
  /** @type {Map<string, string>} */
  const dataUrlByFileName = new Map();
  for (const asset of assets || []) {
    const fileName =
      packageAssetUrlToFileName(asset.path) ||
      asset.fileName ||
      String(asset.path || '')
        .split(/[/\\]/)
        .pop() ||
      '';
    if (!fileName || !asset.base64) continue;
    dataUrlByFileName.set(
      fileName,
      `data:${guessMimeFromFileName(fileName)};base64,${asset.base64}`,
    );
  }

  return String(bodyHtml ?? '').replace(/(?:src|href)=["']([^"']+)["']/gi, (full, url) => {
    const fromPackage = packageAssetUrlToFileName(url);
    if (fromPackage && dataUrlByFileName.has(fromPackage)) {
      const attr = full.toLowerCase().startsWith('href') ? 'href' : 'src';
      return `${attr}="${dataUrlByFileName.get(fromPackage)}"`;
    }
    const basename = String(url).split(/[/\\]/).pop()?.split('?')[0];
    if (basename && dataUrlByFileName.has(basename)) {
      const attr = full.toLowerCase().startsWith('href') ? 'href' : 'src';
      return `${attr}="${dataUrlByFileName.get(basename)}"`;
    }
    return full;
  });
}

/**
 * Standalone HTML file whose body matches the HWPX conversion input.
 *
 * @param {{
 *   bodyHtml: string,
 *   title: string,
 *   embedAssets?: { path?: string, fileName?: string, base64: string }[],
 * }} input
 */
export function wrapSharedExportHtmlDocument({ bodyHtml, title, embedAssets = [] }) {
  const body = embedAssets.length ? embedAssetsAsDataUrls(bodyHtml, embedAssets) : bodyHtml;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${TIPTAP_DOCUMENT_EXPORT_CSS}
</style>
</head>
<body>
<article class="tiptap-doc-export">
${body}
</article>
</body>
</html>
`;
}

/**
 * Minimal HTML document for HWPX conversion (no CSS — pandoc ignores it anyway).
 *
 * @param {string} bodyHtml
 * @param {string} title
 */
export function wrapSharedExportHwpxSource(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
