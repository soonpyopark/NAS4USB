const MAX_HWPX_BYTES = 40 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 2 * 1024 * 1024;

/**
 * @param {unknown} base64
 */
function decodeHwpxBase64(base64) {
  const raw = String(base64 ?? '').replace(/\s+/g, '');
  if (!raw) {
    throw new Error('변환할 HWPX가 비어 있습니다.');
  }
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) {
    throw new Error('변환할 HWPX가 비어 있습니다.');
  }
  if (buffer.length > MAX_HWPX_BYTES) {
    throw new Error('HWPX가 너무 큽니다. 40MB 이하만 변환할 수 있습니다.');
  }
  return buffer;
}

/**
 * @param {unknown} markdown
 */
function normalizeMarkdown(markdown) {
  const text = String(markdown ?? '');
  if (!text.trim()) {
    throw new Error('내보낼 Markdown이 비어 있습니다.');
  }
  if (text.length > MAX_MARKDOWN_CHARS) {
    throw new Error('Markdown이 너무 깁니다.');
  }
  return text;
}

/**
 * @param {unknown} bytes
 */
function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (bytes && typeof bytes === 'object' && 'buffer' in bytes) {
    return Buffer.from(/** @type {ArrayBuffer} */ (bytes.buffer));
  }
  throw new Error('HWPX 변환 결과를 읽지 못했습니다.');
}

/**
 * HWPX bytes → Markdown (host-side; kordoc stays out of the renderer).
 *
 * @param {{ hwpxBase64?: string }} [payload]
 * @returns {Promise<{ markdown: string }>}
 */
export async function hwpxBase64ToMarkdown(payload = {}) {
  const buffer = decodeHwpxBase64(payload.hwpxBase64);
  const { parse } = await import('kordoc');
  const result = await parse(buffer);

  if (!result?.success) {
    const detail = result?.error ? String(result.error) : 'HWPX를 Markdown으로 변환하지 못했습니다.';
    const code = result?.code ? ` (${result.code})` : '';
    throw new Error(`${detail}${code}`);
  }

  return { markdown: String(result.markdown ?? '') };
}

/**
 * Markdown → new HWPX (one-way export, not a round-trip of an existing Hangul file).
 *
 * @param {{ markdown?: string }} [payload]
 * @returns {Promise<{ hwpxBase64: string }>}
 */
export async function markdownToHwpxBase64(payload = {}) {
  const markdown = normalizeMarkdown(payload.markdown);
  const { markdownToHwpx } = await import('kordoc');
  const bytes = await markdownToHwpx(markdown);
  return { hwpxBase64: toBuffer(bytes).toString('base64') };
}
