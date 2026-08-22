import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let HwpDocument = null;
let initialized = false;

function ensureMeasureStub() {
  if (typeof globalThis.measureTextWidth === 'function') return;
  globalThis.measureTextWidth = (_font, text) => String(text || '').length * 8;
}

/**
 * @param {unknown} value
 */
function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return asText(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return asText(value.text);
    if (typeof value.content === 'string') return asText(value.content);
    if (Array.isArray(value.paragraphs)) return asText(value.paragraphs);
    if (Array.isArray(value.pages)) return asText(value.pages);
    return Object.values(value).map((item) => asText(item)).filter(Boolean).join('\n');
  }
  return String(value).trim();
}

/**
 * @param {string} text
 */
function splitBlocks(text) {
  return String(text)
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function initRhwp() {
  if (initialized) return HwpDocument;
  ensureMeasureStub();
  const rhwp = await import('@rhwp/core');
  const wasmPath = path.join(path.dirname(require.resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm');
  const init = rhwp.default || rhwp.init;
  if (typeof init === 'function') {
    await init({ module_or_path: wasmPath });
  }
  HwpDocument = rhwp.HwpDocument;
  if (!HwpDocument) {
    throw new Error('@rhwp/core 에서 HwpDocument를 찾을 수 없습니다.');
  }
  initialized = true;
  return HwpDocument;
}

/**
 * @param {InstanceType<typeof HwpDocument>} doc
 */
function extractFromDocument(doc) {
  const records = [];

  if (
    typeof doc.getSectionCount === 'function' &&
    typeof doc.getParagraphCount === 'function' &&
    typeof doc.getParagraphLength === 'function' &&
    typeof doc.getTextRange === 'function'
  ) {
    const sectionCount = Number(doc.getSectionCount()) || 0;
    for (let section = 0; section < sectionCount; section += 1) {
      const paraCount = Number(doc.getParagraphCount(section)) || 0;
      for (let para = 0; para < paraCount; para += 1) {
        const length = Number(doc.getParagraphLength(section, para)) || 0;
        const content = asText(length > 0 ? doc.getTextRange(section, para, 0, length) : '');
        if (!content) continue;
        let page = null;
        if (typeof doc.getPageOfPosition === 'function') {
          const rawPage = asText(doc.getPageOfPosition(section, para));
          const parsed = Number(String(rawPage).replace(/[^\d]/g, ''));
          page = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        records.push({
          location_label: page
            ? `${page}쪽 · 문단 ${para + 1}`
            : `구역 ${section + 1} · 문단 ${para + 1}`,
          location_json: JSON.stringify({ section: section + 1, paragraph: para + 1, page }),
          content,
        });
      }
    }
    if (records.length) return records;
  }

  if (typeof doc.pageCount === 'function' && typeof doc.getPageText === 'function') {
    const total = Number(doc.pageCount()) || 0;
    for (let page = 0; page < total; page += 1) {
      const blocks = splitBlocks(asText(doc.getPageText(page)));
      blocks.forEach((content, index) => {
        records.push({
          location_label: `${page + 1}쪽 · 문단 ${index + 1}`,
          location_json: JSON.stringify({ page: page + 1, paragraph: index + 1 }),
          content,
        });
      });
    }
    if (records.length) return records;
  }

  for (const name of ['getTextFileUnicode', 'getTextFileText', 'getText', 'text']) {
    if (typeof doc[name] !== 'function') continue;
    const blocks = splitBlocks(asText(doc[name]()));
    blocks.forEach((content, index) => {
      records.push({
        location_label: `문단 ${index + 1}`,
        location_json: JSON.stringify({ paragraph: index + 1 }),
        content,
      });
    });
    if (records.length) return records;
  }

  return records;
}

/**
 * @param {string} filePath
 */
export async function parseHwp(filePath) {
  const Document = await initRhwp();
  const buffer = new Uint8Array(await fs.readFile(filePath));
  const doc = new Document(buffer);
  try {
    return extractFromDocument(doc);
  } finally {
    if (typeof doc.free === 'function') {
      doc.free();
    }
  }
}
