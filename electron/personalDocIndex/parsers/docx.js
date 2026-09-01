import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { parseDoc } from './doc.js';

function decodeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractParagraphs(xml) {
  const paragraphs = [];
  const blocks = xml.split(/<\/w:p>/);
  for (const block of blocks) {
    const texts = [...block.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]);
    const text = decodeXml(texts.join('')).replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

async function parseDocxXml(filePath) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const records = [];

  const xmlFiles = Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  for (const name of xmlFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const paragraphs = extractParagraphs(xml);
    const source = name.includes('header') ? '머리말' : name.includes('footer') ? '꼬리말' : '본문';

    paragraphs.forEach((content, index) => {
      records.push({
        location_label: `${source} · 문단 ${index + 1}`,
        location_json: JSON.stringify({
          part: name,
          paragraph: index + 1,
        }),
        content,
      });
    });
  }

  return records;
}

/**
 * @param {string} filePath
 */
export async function parseDocx(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.doc') {
    return parseDoc(filePath);
  }
  return parseDocxXml(filePath);
}
