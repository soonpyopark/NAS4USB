import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import XLSX from 'xlsx';

const SLIDE = 0x03ee;
const NOTES = 0x03f0;
const SLIDE_PERSIST = 0x03f3;
const TEXT_CHARS = 0x0fa0;
const TEXT_BYTES = 0x0fa8;

function decodeXml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractPptxTexts(xml) {
  return [...String(xml || '').matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)]
    .map((match) => decodeXml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function slideNumberFromName(name, prefix) {
  const match = String(name).match(new RegExp(`${prefix}(\\d+)\\.xml$`, 'i'));
  return match ? Number(match[1]) : 0;
}

function recordFromSlide(slide, texts, note = false) {
  const content = texts.join('\n').trim();
  if (!content) return null;
  return {
    location_label: note ? `슬라이드 ${slide} · 노트` : `슬라이드 ${slide}`,
    location_json: JSON.stringify({ slide, note }),
    content,
  };
}

async function parsePptx(filePath) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const records = [];

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumberFromName(a, 'slide') - slideNumberFromName(b, 'slide'));

  for (const name of slideNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const record = recordFromSlide(slideNumberFromName(name, 'slide'), extractPptxTexts(xml));
    if (record) records.push(record);
  }

  const noteNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumberFromName(a, 'notesSlide') - slideNumberFromName(b, 'notesSlide'));

  for (const name of noteNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const record = recordFromSlide(slideNumberFromName(name, 'notesSlide'), extractPptxTexts(xml), true);
    if (record) records.push(record);
  }

  return records;
}

function decodePptBytes(buffer) {
  try {
    const euc = new TextDecoder('euc-kr').decode(buffer);
    const latin = buffer.toString('latin1');
    const eucHangul = (euc.match(/[가-힣]/g) || []).length;
    const latinHangul = (latin.match(/[가-힣]/g) || []).length;
    return eucHangul > latinHangul ? euc : latin;
  } catch {
    return buffer.toString('latin1');
  }
}

function toNodeBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (Array.isArray(content)) return Buffer.from(content);
  return Buffer.alloc(0);
}

function walkPptRecords(data, start, end, state) {
  let offset = start;
  while (offset + 8 <= end) {
    const header = data.readUInt16LE(offset);
    const recVer = header & 0x000f;
    const recType = data.readUInt16LE(offset + 2);
    const recLen = data.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = Math.min(end, bodyStart + recLen);
    if (bodyEnd < bodyStart) break;

    if (recType === SLIDE_PERSIST) {
      state.persist = true;
      state.slide += 1;
      state.note = false;
    } else if (recType === SLIDE && !state.persist) {
      state.slide += 1;
      state.note = false;
    } else if (recType === NOTES) {
      state.note = true;
    } else if (recType === TEXT_CHARS) {
      const text = data.toString('utf16le', bodyStart, bodyEnd).replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) {
        const slide = Math.max(1, state.slide);
        const key = `${slide}:${state.note ? 'note' : 'body'}`;
        if (!state.buckets.has(key)) {
          state.buckets.set(key, { slide, note: state.note, texts: [] });
        }
        state.buckets.get(key).texts.push(text);
      }
    } else if (recType === TEXT_BYTES) {
      const text = decodePptBytes(data.subarray(bodyStart, bodyEnd)).replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) {
        const slide = Math.max(1, state.slide);
        const key = `${slide}:${state.note ? 'note' : 'body'}`;
        if (!state.buckets.has(key)) {
          state.buckets.set(key, { slide, note: state.note, texts: [] });
        }
        state.buckets.get(key).texts.push(text);
      }
    }

    if (recVer === 0x0f) {
      walkPptRecords(data, bodyStart, bodyEnd, state);
    }
    offset = bodyEnd;
  }
}

async function parsePptBinary(filePath) {
  const buffer = Buffer.from(await fs.readFile(filePath));
  const cfb = XLSX.CFB.read(buffer, { type: 'buffer' });
  const entry = XLSX.CFB.find(cfb, 'PowerPoint Document');
  if (!entry || !entry.content) {
    throw new Error('구형 PowerPoint 문서 구조를 읽지 못했습니다.');
  }
  const data = toNodeBuffer(entry.content);
  const state = { slide: 0, persist: false, note: false, buckets: new Map() };
  walkPptRecords(data, 0, data.length, state);
  const records = [...state.buckets.values()]
    .sort((left, right) => left.slide - right.slide || Number(left.note) - Number(right.note))
    .map((item) => recordFromSlide(item.slide, item.texts, item.note))
    .filter(Boolean);
  if (!records.length) {
    throw new Error('구형 PowerPoint에서 텍스트를 읽지 못했습니다.');
  }
  return records;
}

/**
 * @param {string} filePath
 */
export async function parsePpt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ppt') {
    return parsePptBinary(filePath);
  }
  return parsePptx(filePath);
}
