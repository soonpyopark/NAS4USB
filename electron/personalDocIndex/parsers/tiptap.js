import fs from 'node:fs/promises';
import JSZip from 'jszip';

const DOCUMENT_NAME = /^document\.json$/i;

/**
 * @param {unknown} node
 * @param {string[]} out
 */
function collectText(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectText(item, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  if (typeof node.text === 'string' && node.text) out.push(node.text);
  for (const key of ['alt', 'title', 'latex']) {
    const value = node.attrs?.[key];
    if (typeof value === 'string' && value) out.push(value);
  }
  if (node.content) collectText(node.content, out);
  return out;
}

/**
 * @param {unknown} node
 * @param {Array<{ location_label: string, location_json: string, content: string }>} records
 * @param {{ index: number }} ctx
 */
function collectBlocks(node, records, ctx) {
  if (Array.isArray(node)) {
    for (const item of node) collectBlocks(item, records, ctx);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const type = String(node.type ?? '');
  if (
    type === 'heading' ||
    type === 'paragraph' ||
    type === 'blockquote' ||
    type === 'codeBlock' ||
    type === 'listItem' ||
    type === 'taskItem'
  ) {
    const text = collectText(node, []).join('').replace(/\s+/g, ' ').trim();
    if (text) {
      ctx.index += 1;
      const headingLevel = Number(node.attrs?.level);
      records.push({
        location_label:
          type === 'heading' && headingLevel
            ? `제목 ${headingLevel}`
            : `문단 ${ctx.index}`,
        location_json: JSON.stringify({ paragraph: ctx.index, type, level: headingLevel || null }),
        content: text,
      });
    }
    return;
  }

  if (node.content) collectBlocks(node.content, records, ctx);
}

/**
 * @param {string} filePath
 */
export async function parseTiptap(filePath) {
  const bytes = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(bytes);
  const documentFile = Object.values(zip.files).find(
    (file) => !file.dir && DOCUMENT_NAME.test(file.name),
  );
  if (!documentFile) return [];

  const parsed = JSON.parse(await documentFile.async('string'));
  const records = [];
  collectBlocks(parsed?.content ?? parsed, records, { index: 0 });
  return records;
}
