import fs from 'node:fs/promises';
import { decodeTextBytes } from './textEncoding.js';

/**
 * @param {string} filePath
 */
export async function parseText(filePath) {
  const raw = await fs.readFile(filePath);
  const text = decodeTextBytes(raw);
  const records = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const content = line.replace(/\s+/g, ' ').trim();
    if (!content) return;
    records.push({
      location_label: `${index + 1}행`,
      location_json: JSON.stringify({ line: index + 1 }),
      content,
    });
  });
  return records;
}
