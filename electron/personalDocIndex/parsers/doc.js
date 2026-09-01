import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WordExtractor = require('word-extractor');

function splitBlocks(text) {
  return String(text || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function addPart(records, source, text, extra = {}) {
  splitBlocks(text).forEach((content, index) => {
    records.push({
      location_label: `${source} · 문단 ${index + 1}`,
      location_json: JSON.stringify({
        part: source,
        paragraph: index + 1,
        ...extra,
      }),
      content,
    });
  });
}

/**
 * @param {string} filePath
 */
export async function parseDoc(filePath) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  const records = [];
  addPart(records, '본문', doc.getBody({ filterUnicode: false }));
  addPart(records, '머리말', doc.getHeaders({ filterUnicode: false, includeFooters: false }));
  addPart(records, '꼬리말', doc.getFooters({ filterUnicode: false }));
  addPart(records, '텍스트 상자', doc.getTextboxes({ filterUnicode: false }));
  if (!records.length) {
    throw new Error('구형 Word 문서에서 텍스트를 읽지 못했습니다.');
  }
  return records;
}
