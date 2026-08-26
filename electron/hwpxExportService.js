import path from 'node:path';

/**
 * TipTap / Markdown → HWPX via kordoc (`markdownToHwpx`).
 * Gongmun presets stay off so lists keep Markdown numbering.
 * Offline: `KORDOC_OFFLINE=1` blocks optional OCR/model downloads.
 */

function ensureKordocOffline() {
  if (!process.env.KORDOC_OFFLINE) {
    process.env.KORDOC_OFFLINE = '1';
  }
}

/**
 * @param {string} value
 */
function decodeUrlLoose(value) {
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

/**
 * @param {{ fileName?: string, base64?: string }[]} assets
 * @returns {Record<string, Buffer>}
 */
function buildImageMap(assets) {
  /** @type {Record<string, Buffer>} */
  const images = {};
  for (const asset of assets) {
    const safeName = path.basename(String(asset.fileName || '')).replace(/[^\w.\-()+]/g, '_');
    if (!safeName || !asset.base64) continue;
    const bytes = Buffer.from(asset.base64, 'base64');
    images[safeName] = bytes;
    images[`assets/${safeName}`] = bytes;
    images[`asset/${safeName}`] = bytes;
  }
  return images;
}

/**
 * Point `![alt](url)` at keys present in the image map.
 *
 * @param {string} markdown
 * @param {Record<string, Buffer>} images
 */
function rewriteMarkdownImageUrls(markdown, images) {
  return String(markdown ?? '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
    const raw = decodeUrlLoose(String(url).trim());
    if (!raw || raw.startsWith('data:')) return full;
    const withoutQuery = raw.split(/[?#]/)[0];
    const base = path.posix.basename(withoutQuery.replace(/\\/g, '/'));
    if (images[raw]) return `![${alt}](${raw})`;
    if (images[withoutQuery]) return `![${alt}](${withoutQuery})`;
    if (base && images[base]) return `![${alt}](${base})`;
    if (base && images[`assets/${base}`]) return `![${alt}](assets/${base})`;
    return full;
  });
}

/**
 * kordoc generate does not emit highlight shade from `==text==` / `<mark>`.
 * Unwrap so those markers do not print as literals.
 *
 * @param {string} markdown
 */
function unwrapUnsupportedHighlightMarkup(markdown) {
  return String(markdown ?? '')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
}

/**
 * @param {string} fileName
 */
function hwpxFileName(fileName) {
  const stem = String(fileName || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-()\uac00-\ud7a3 ]+/g, '_')
    .trim() || 'document';
  return `${stem}.hwpx`;
}

/**
 * Convert Markdown (+ optional sidecar images) to HWPX bytes (base64).
 *
 * @param {{
 *   markdown?: string,
 *   html?: string,
 *   fileName?: string,
 *   assets?: { fileName: string, base64: string }[],
 * }} input
 * @returns {Promise<{ base64: string, fileName: string }>}
 */
export async function convertMarkdownToHwpxBase64(input) {
  ensureKordocOffline();

  const markdown = String(input.markdown ?? '').trim();
  if (!markdown) {
    throw new Error(
      'HWPX 변환에 마크다운이 필요합니다. 앱을 새로고침한 뒤 다시 내보내세요.',
    );
  }

  const outName = hwpxFileName(input.fileName);
  const images = buildImageMap(Array.isArray(input.assets) ? input.assets : []);
  const prepared = unwrapUnsupportedHighlightMarkup(
    rewriteMarkdownImageUrls(markdown, images),
  );

  let markdownToHwpx;
  try {
    ({ markdownToHwpx } = await import('kordoc'));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`HWPX 변환 모듈(kordoc)을 불러오지 못했습니다: ${detail}`);
  }

  let buffer;
  try {
    buffer = await markdownToHwpx(prepared, { images });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`HWPX 변환 실패: ${detail}`);
  }

  const bytes = Buffer.from(buffer);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('HWPX 변환 결과가 비어 있거나 올바르지 않습니다.');
  }

  return {
    base64: bytes.toString('base64'),
    fileName: outName,
  };
}

/** @deprecated use convertMarkdownToHwpxBase64 */
export const convertHtmlToHwpxBase64 = convertMarkdownToHwpxBase64;

/**
 * @returns {Promise<{ ready: boolean, exportRoot: string, detail?: string }>}
 */
export async function getHwpxExportStatus() {
  ensureKordocOffline();
  try {
    await import('kordoc');
    return { ready: true, exportRoot: 'kordoc' };
  } catch (err) {
    return {
      ready: false,
      exportRoot: 'kordoc',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
